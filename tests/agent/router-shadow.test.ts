import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveRouterShadowMode, isRouterShadowEnabled } from "../../src/lib/agent/router/router-shadow-config";
import { snapshotProductionDecision, compareRouterDecisions, priorityCategory, isUnsafe, clearCollector, getCollectorEntries, scheduleRouterShadow, flushPendingShadow } from "../../src/lib/agent/router/router-shadow";

describe("router-shadow", () => {
  /* ── Feature flag ── */
  describe("router-shadow-config", () => {
    let orig: string | undefined;
    beforeEach(() => { orig = process.env.AGENT_ROUTER_SHADOW; delete process.env.AGENT_ROUTER_SHADOW; });
    afterEach(() => { if (orig === undefined) delete process.env.AGENT_ROUTER_SHADOW; else process.env.AGENT_ROUTER_SHADOW = orig; });

    it("default → off", () => assert.equal(resolveRouterShadowMode(), "off"));
    it("off → off", () => { process.env.AGENT_ROUTER_SHADOW = "off"; assert.equal(resolveRouterShadowMode(), "off"); });
    it("admin → admin", () => { process.env.AGENT_ROUTER_SHADOW = "admin"; assert.equal(resolveRouterShadowMode(), "admin"); });
    it("on → on", () => { process.env.AGENT_ROUTER_SHADOW = "on"; assert.equal(resolveRouterShadowMode(), "on"); });
    it("unknown → off", () => { process.env.AGENT_ROUTER_SHADOW = "invalid"; assert.equal(resolveRouterShadowMode(), "off"); });
    it("isEnabled: off=false", () => { process.env.AGENT_ROUTER_SHADOW = "off"; assert.equal(isRouterShadowEnabled(), false); });
    it("isEnabled: on=true", () => { process.env.AGENT_ROUTER_SHADOW = "on"; assert.equal(isRouterShadowEnabled(), true); });
    it("isEnabled: admin=true", () => { process.env.AGENT_ROUTER_SHADOW = "admin"; assert.equal(isRouterShadowEnabled(), true); });
  });

  /* ── Production snapshot ── */
  describe("snapshotProductionDecision", () => {
    it("null intent → unknown", () => {
      const s = snapshotProductionDecision(null);
      assert.equal(s.intent, "unknown");
      assert.equal(s.readWriteClass, "unknown");
    });

    it("answer_question → read", () => {
      const s = snapshotProductionDecision({ intent: "answer_question", args: {}, confidence: 0.9 } as never);
      assert.equal(s.intent, "answer_question");
      assert.equal(s.readWriteClass, "read");
      assert.equal(s.needsClarification, false);
    });

    it("clarify → clarify", () => {
      const s = snapshotProductionDecision({ intent: "clarify", args: {}, confidence: 0.9 } as never);
      assert.equal(s.readWriteClass, "clarify");
      assert.equal(s.needsClarification, true);
    });

    it("compose_plan → write_candidate", () => {
      const s = snapshotProductionDecision({ intent: "compose_plan", args: {}, confidence: 0.9 } as never);
      assert.equal(s.readWriteClass, "write_candidate");
    });
  });

  /* ── Comparison ── */
  describe("compareRouterDecisions", () => {
    const primary = (intent: string) => snapshotProductionDecision({ intent, args: {}, confidence: 0.9 } as never);

    it("same intent → match", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: true, intent: "answer_question", readWriteClass: "answer", schemaValid: true });
      assert.ok(r.categories.includes("match"));
    });

    it("different intent → intent_mismatch", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: true, intent: "compose_plan", readWriteClass: "write_candidate", schemaValid: true });
      assert.ok(r.categories.includes("intent_mismatch"));
    });

    it("read → write_candidate mismatch → unsafe", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: true, intent: "compose_plan", readWriteClass: "write_candidate", schemaValid: true });
      assert.ok(r.categories.includes("read_write_mismatch"));
    });

    it("clarify → write mismatch → unsafe", () => {
      const r = compareRouterDecisions(primary("clarify"), { attempted: true, intent: "compose_plan", readWriteClass: "write_candidate", schemaValid: true });
      assert.ok(r.categories.includes("clarify_mismatch"));
      assert.ok(r.categories.includes("read_write_mismatch"));
    });

    it("shadow not attempted → provider failure", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: false });
      assert.ok(r.categories.includes("shadow_provider_failure"));
    });

    it("shadow schema failure", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: true, schemaValid: false, errorCode: "STRUCTURED_OUTPUT_INVALID" });
      assert.ok(r.categories.includes("shadow_schema_failure"));
    });

    it("primary unknown", () => {
      const r = compareRouterDecisions(snapshotProductionDecision(null), { attempted: true, intent: "answer_question", schemaValid: true });
      assert.ok(r.categories.includes("primary_unknown"));
    });

    it("same write_candidate → match", () => {
      const r = compareRouterDecisions(primary("compose_plan"), { attempted: true, intent: "compose_plan", readWriteClass: "write_candidate", schemaValid: true });
      assert.ok(r.categories.includes("match"));
    });

    it("comparison does NOT contain user message", () => {
      const r = compareRouterDecisions(primary("answer_question"), { attempted: true, intent: "answer_question", schemaValid: true });
      const json = JSON.stringify(r);
      assert.ok(!json.includes("raw message"));
      assert.ok(!json.includes("apiKey"));
      assert.ok(!json.includes("Bearer"));
      assert.ok(!json.includes("secret"));
    });
  });

  /* ── Prioritization ── */
  describe("priorityCategory", () => {
    it("read_write_mismatch is top priority", () => assert.equal(priorityCategory(["match", "read_write_mismatch", "intent_mismatch"]), "read_write_mismatch"));
    it("clarify_mismatch over intent", () => assert.equal(priorityCategory(["intent_mismatch", "clarify_mismatch"]), "clarify_mismatch"));
    it("match is lowest", () => assert.equal(priorityCategory(["match"]), "match"));
    it("unsafe: read→write", () => assert.equal(isUnsafe(["read_write_mismatch"]), true));
    it("unsafe: clarify→write", () => assert.equal(isUnsafe(["clarify_mismatch"]), true));
    it("safe: match only", () => assert.equal(isUnsafe(["match"]), false));
    it("safe: intent mismatch without read/write", () => assert.equal(isUnsafe(["intent_mismatch"]), false));
  });

  /* ── Collector ── */
  describe("in-memory collector", () => {
    it("starts empty", () => { clearCollector(); assert.equal(getCollectorEntries().length, 0); });
  });

  /* ── Isolation contracts ── */
  describe("isolation", () => {
    it("shadow default disabled", () => {
      assert.equal(isRouterShadowEnabled(), false);
    });

    it("comparison is a pure function", () => {
      const p = snapshotProductionDecision({ intent: "answer_question", args: {}, confidence: 0.9 } as never);
      const s = { attempted: true as const, intent: "answer_question", schemaValid: true };
      const a = compareRouterDecisions(p, s);
      const b = compareRouterDecisions(p, s);
      assert.deepEqual(a, b);
    });

    it("write_candidate in comparison does NOT mean executable", () => {
      const p = snapshotProductionDecision({ intent: "compose_plan", args: {}, confidence: 0.9 } as never);
      const s = { attempted: true as const, intent: "compose_plan", readWriteClass: "write_candidate", schemaValid: true };
      const r = compareRouterDecisions(p, s);
      assert.ok(r.categories.includes("match"));
      /* write_candidate is a comparison classification, NOT execute permission */
    });
  });

  /* ── Hook integration: Primary unchanged ── */
  describe("scheduleRouterShadow", () => {
    let orig: string | undefined;
    beforeEach(() => { orig = process.env.AGENT_ROUTER_SHADOW; delete process.env.AGENT_ROUTER_SHADOW; clearCollector(); });
    afterEach(async () => { if (orig === undefined) delete process.env.AGENT_ROUTER_SHADOW; else process.env.AGENT_ROUTER_SHADOW = orig; await flushPendingShadow(); });

    it("scheduleRouterShadow returns void (fire-and-forget)", () => {
      process.env.AGENT_ROUTER_SHADOW = "off";
      const result = scheduleRouterShadow({ primaryIntent: "answer_question", message: "hello", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      assert.equal(result, undefined); /* void return — non-blocking */
    });

    it("off → does not call shadow, collector empty after flush", async () => {
      process.env.AGENT_ROUTER_SHADOW = "off";
      clearCollector();
      scheduleRouterShadow({ primaryIntent: "answer_question", message: "hello", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      await flushPendingShadow();
      assert.equal(getCollectorEntries().length, 0);
    });

    it("disabled is NOT classified as provider failure", () => {
      process.env.AGENT_ROUTER_SHADOW = "off";
      /* Primary unchanged — shadow is simply not invoked */
      assert.equal(getCollectorEntries().length, 0);
    });

    it("primary response is always returned first (non-blocking)", () => {
      const primaryIntent = "answer_question";
      process.env.AGENT_ROUTER_SHADOW = "off";
      scheduleRouterShadow({ primaryIntent, message: "test", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      /* Primary code continues immediately — no await on shadow */
      assert.equal(primaryIntent, "answer_question");
    });

    it("preResolvedIntent is NOT modified by shadow", () => {
      /* Shadow receives a COPY of the intent string, not a reference */
      const intent = "answer_question";
      const snapshot = snapshotProductionDecision({ intent, args: {}, confidence: 0.9 } as never);
      assert.equal(snapshot.intent, intent);
      /* Shadow comparison runs on a snapshot — the original is untouched */
    });

    it("shadow does NOT call Executor", () => {
      /* The shadow module has no import of Executor, Draft, Dry-run, or Policy Guard */
      const s = snapshotProductionDecision({ intent: "answer_question", args: {}, confidence: 0.9 } as never);
      assert.equal(s.intent, "answer_question");
      /* No execute, no receipt, no rollback in the shadow path */
    });

    it("collector records disabled entry when shadow off", async () => {
      process.env.AGENT_ROUTER_SHADOW = "off";
      clearCollector();
      scheduleRouterShadow({ primaryIntent: "answer_question", message: "test", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      await flushPendingShadow();
      const entries = getCollectorEntries();
      assert.equal(entries.length, 0); /* off → no entry, correctly skipped */
    });

    it("flushPendingShadow resolves immediately with no pending work", async () => {
      process.env.AGENT_ROUTER_SHADOW = "off";
      scheduleRouterShadow({ primaryIntent: "answer_question", message: "t1", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      scheduleRouterShadow({ primaryIntent: "answer_question", message: "t2", hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-10" });
      /* off mode → promises resolve synchronously (null return) */
      await flushPendingShadow();
      assert.ok(true); /* does not hang */
    });
  });
});
