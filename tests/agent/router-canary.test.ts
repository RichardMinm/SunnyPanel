import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ROUTER_CANARY_TIMEOUT_MS,
  normalizeRouterCanaryTimeoutMs,
  resolveRouterCanaryMode,
  resolveRouterCanaryTimeoutMs,
} from "../../src/lib/agent/router/router-canary-config";
import {
  clearRouterCanaryCollector,
  decideRouterCanary,
  getRouterCanaryCollectorEntries,
  resolveRouterCanaryRouting,
} from "../../src/lib/agent/router/router-canary";
import type { RouterShadowResult } from "../../src/lib/agent/router/router-shadow";
import type { AgentIntent } from "../../src/lib/agent/schemas";

const primaryAnswer: AgentIntent = {
  args: { answer: "线性代数可以从向量和矩阵开始。", learningContext: null, suggestAction: null },
  confidence: 0.9,
  intent: "answer_question",
  reply: "线性代数可以从向量和矩阵开始。",
};

const primaryQuery: AgentIntent = {
  args: { checklistTitle: null, scope: "all" },
  confidence: 0.9,
  intent: "query_progress",
};

const primaryWrite: AgentIntent = {
  args: { goal: "学习线性代数" },
  confidence: 0.9,
  intent: "compose_plan",
};

const candidate = (overrides: Partial<RouterShadowResult> = {}): RouterShadowResult => ({
  attempted: true,
  confidence: 0.92,
  contextReferences: [],
  intent: "answer_question",
  mode: "single",
  needsClarification: false,
  readWriteClass: "answer",
  riskFlags: [],
  schemaValid: true,
  ...overrides,
});

describe("Router read-only canary config", () => {
  const originalMode = process.env.AGENT_ROUTER_CANARY;
  const originalTimeout = process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;

  beforeEach(() => {
    delete process.env.AGENT_ROUTER_CANARY;
    delete process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.AGENT_ROUTER_CANARY;
    else process.env.AGENT_ROUTER_CANARY = originalMode;
    if (originalTimeout === undefined) delete process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS;
    else process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = originalTimeout;
  });

  it("defaults to off and treats unknown/on values as off", () => {
    assert.equal(resolveRouterCanaryMode(), "off");
    process.env.AGENT_ROUTER_CANARY = "on";
    assert.equal(resolveRouterCanaryMode(), "off");
    process.env.AGENT_ROUTER_CANARY = "unknown";
    assert.equal(resolveRouterCanaryMode(), "off");
  });

  it("accepts admin mode only", () => {
    process.env.AGENT_ROUTER_CANARY = "admin";
    assert.equal(resolveRouterCanaryMode(), "admin");
  });

  it("uses an 8000ms default, accepts bounded integers, and rejects values above 12000ms", () => {
    assert.equal(resolveRouterCanaryTimeoutMs(), DEFAULT_ROUTER_CANARY_TIMEOUT_MS);
    process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = "3500";
    assert.equal(resolveRouterCanaryTimeoutMs(), 3500);
    for (const invalid of ["0", "-1", "1.5", "abc", "12001"]) {
      process.env.AGENT_ROUTER_CANARY_TIMEOUT_MS = invalid;
      assert.equal(resolveRouterCanaryTimeoutMs(), DEFAULT_ROUTER_CANARY_TIMEOUT_MS);
    }
    assert.equal(normalizeRouterCanaryTimeoutMs(12_000), 12_000);
    for (const invalid of [0, -1, Number.NaN, 12_001, 60_000]) {
      assert.equal(normalizeRouterCanaryTimeoutMs(invalid), DEFAULT_ROUTER_CANARY_TIMEOUT_MS);
    }
  });
});

describe("decideRouterCanary", () => {
  const decide = (overrides: Partial<Parameters<typeof decideRouterCanary>[0]> = {}) =>
    decideRouterCanary({
      actor: "admin",
      candidate: candidate(),
      mode: "admin",
      primary: primaryAnswer,
      ...overrides,
    });

  it("keeps Primary when disabled or actor is not allowlisted", () => {
    const disabled = decide({ mode: "off" });
    const denied = decide({ actor: "user" });
    assert.equal(disabled.adopted, false);
    assert.equal(disabled.reason, "disabled");
    assert.strictEqual(disabled.decision, primaryAnswer);
    assert.equal(denied.reason, "not_allowlisted");
    assert.strictEqual(denied.decision, primaryAnswer);
  });

  it("adopts a schema-valid answer and read query only when it agrees with the read-only Primary intent", () => {
    const answer = decide();
    const query = decide({
      candidate: candidate({ intent: "query_progress" }),
      primary: primaryQuery,
    });
    assert.equal(answer.adopted, true);
    assert.equal(answer.reason, "adopted_read");
    assert.notStrictEqual(answer.decision, primaryAnswer);
    assert.equal(answer.decision.intent, "answer_question");
    assert.equal(query.adopted, true);
    assert.equal(query.reason, "adopted_read");
    assert.equal(query.decision.intent, "query_progress");
  });

  it("adopts valid clarify with a non-empty candidate question", () => {
    const result = decide({
      candidate: candidate({
        clarificationQuestion: "你希望安排什么事项？",
        intent: "clarify",
        needsClarification: true,
        readWriteClass: "clarify",
      }),
      primary: primaryWrite,
    });
    assert.equal(result.adopted, true);
    assert.equal(result.reason, "adopted_clarify");
    assert.deepEqual(result.decision, {
      args: { missingFields: [], question: "你希望安排什么事项？" },
      confidence: 0.92,
      intent: "clarify",
    });
  });

  it("rejects write candidates and compound outputs", () => {
    const write = decide({
      candidate: candidate({ intent: "compose_plan", readWriteClass: "write_candidate" }),
    });
    const compound = decide({ candidate: candidate({ mode: "compound" }) });
    assert.equal(write.reason, "write_excluded");
    assert.equal(compound.reason, "compound_excluded");
    assert.strictEqual(write.decision, primaryAnswer);
    assert.strictEqual(compound.decision, primaryAnswer);
  });

  it("fails closed when single mode is missing or clarify intent/class disagree", () => {
    const missingMode = decide({ candidate: candidate({ mode: undefined }) });
    const inconsistentClarify = decide({
      candidate: candidate({
        clarificationQuestion: "请补充信息。",
        intent: "answer_question",
        needsClarification: true,
        readWriteClass: "clarify",
      }),
    });
    assert.equal(missingMode.adopted, false);
    assert.equal(missingMode.reason, "schema_failure");
    assert.equal(inconsistentClarify.adopted, false);
    assert.equal(inconsistentClarify.reason, "unsafe_mismatch");
  });

  it("rejects schema/provider failures, unsafe mismatch, low confidence, invalid resource, and unsupported intent", () => {
    assert.equal(decide({ candidate: candidate({ failureKind: "schema", schemaValid: false }) }).reason, "schema_failure");
    assert.equal(decide({ candidate: candidate({ failureKind: "provider", schemaValid: undefined }) }).reason, "provider_failure");
    assert.equal(decide({ unsafeMismatch: true }).reason, "unsafe_mismatch");
    assert.equal(decide({ candidate: candidate({ confidence: 0.79 }) }).reason, "low_confidence");
    assert.equal(decide({ invalidResource: true }).reason, "invalid_resource");
    assert.equal(decide({ candidate: candidate({ intent: "query_plan" }) }).reason, "unsafe_mismatch");
    assert.equal(decide({ candidate: candidate({ intent: "unknown_intent" }) }).reason, "unsupported_intent");
  });

  it("does not adopt clarify without a question", () => {
    const result = decide({
      candidate: candidate({
        clarificationQuestion: null,
        intent: "clarify",
        needsClarification: true,
        readWriteClass: "clarify",
      }),
    });
    assert.equal(result.adopted, false);
    assert.equal(result.reason, "schema_failure");
  });

  it("classifies the real invented-resource failure shape as invalid_resource", () => {
    const result = decide({
      candidate: candidate({
        errorCode: "ROUTER_CONTEXT_REFERENCE_INVALID",
        failureKind: "schema",
        schemaValid: false,
      }),
    });
    assert.equal(result.reason, "invalid_resource");
    assert.strictEqual(result.decision, primaryAnswer);
  });

  it("cmp-2 compound clarify and cmp-4 write mismatch both keep Primary", () => {
    const cmp2 = decide({
      candidate: candidate({
        clarificationQuestion: "需要确认原任务。",
        intent: "clarify",
        mode: "compound",
        needsClarification: true,
        readWriteClass: "clarify",
      }),
    });
    const cmp4 = decide({
      candidate: candidate({ intent: "create_checklist", readWriteClass: "write_candidate" }),
    });
    assert.equal(cmp2.reason, "compound_excluded");
    assert.equal(cmp4.reason, "write_excluded");
    assert.strictEqual(cmp2.decision, primaryAnswer);
    assert.strictEqual(cmp4.decision, primaryAnswer);
  });

  it("treats prompt-injection write output as excluded and never upgrades it to a read", () => {
    const injected = decide({
      candidate: candidate({ intent: "delete_record", readWriteClass: "write_candidate" }),
    });
    assert.equal(injected.adopted, false);
    assert.equal(injected.reason, "write_excluded");
    assert.strictEqual(injected.decision, primaryAnswer);
  });

  it("adopts an existing-resource read but clarifies a missing-resource request", () => {
    const existing = decide({
      candidate: candidate({
        contextReferences: [{ id: 42, type: "plan" }],
        intent: "query_plan",
      }),
      primary: { ...primaryQuery, intent: "query_plan" },
    });
    const missing = decide({
      candidate: candidate({
        clarificationQuestion: "你指的是哪个计划？",
        intent: "clarify",
        missingFields: ["planId"],
        needsClarification: true,
        readWriteClass: "clarify",
      }),
      primary: primaryQuery,
    });
    assert.equal(existing.reason, "adopted_read");
    assert.equal(missing.reason, "adopted_clarify");
  });
});

describe("resolveRouterCanaryRouting", () => {
  const originalCanary = process.env.AGENT_ROUTER_CANARY;
  const originalShadow = process.env.AGENT_ROUTER_SHADOW;

  beforeEach(() => {
    process.env.AGENT_ROUTER_CANARY = "admin";
    clearRouterCanaryCollector();
  });

  afterEach(() => {
    if (originalCanary === undefined) delete process.env.AGENT_ROUTER_CANARY;
    else process.env.AGENT_ROUTER_CANARY = originalCanary;
    if (originalShadow === undefined) delete process.env.AGENT_ROUTER_SHADOW;
    else process.env.AGENT_ROUTER_SHADOW = originalShadow;
    clearRouterCanaryCollector();
  });

  it("keeps Canary and Shadow flags independent when Canary is off", async () => {
    process.env.AGENT_ROUTER_CANARY = "off";
    process.env.AGENT_ROUTER_SHADOW = "on";
    let candidateCalls = 0;
    let scheduledShadowCalls = 0;
    const result = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
    }, {
      invokeCandidate: async () => { candidateCalls += 1; return candidate(); },
      scheduleShadow: () => { scheduledShadowCalls += 1; },
    });
    assert.equal(result.reason, "disabled");
    assert.strictEqual(result.decision, primaryAnswer);
    assert.equal(candidateCalls, 0);
    assert.equal(scheduledShadowCalls, 1);
  });

  it("uses one Router model call when Canary and Shadow observation are both enabled", async () => {
    let modelCalls = 0;
    let shadowObservations = 0;
    const result = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
    }, {
      invokeCandidate: async () => { modelCalls += 1; return candidate(); },
      isShadowEnabled: () => true,
      observeShadow: () => { shadowObservations += 1; },
    });
    assert.equal(result.adopted, true);
    assert.equal(modelCalls, 1);
    assert.equal(shadowObservations, 1);
  });

  it("isolates Shadow observation failure from a valid Canary adoption", async () => {
    const result = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
    }, {
      invokeCandidate: async () => candidate(),
      isShadowEnabled: () => true,
      observeShadow: () => { throw new Error("observer unavailable"); },
    });
    assert.equal(result.adopted, true);
    assert.equal(result.reason, "adopted_read");
  });

  it("returns Primary on timeout and abort without an unhandled rejection", async () => {
    const neverSettles = ({ signal }: { signal?: AbortSignal }) => new Promise<RouterShadowResult>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const timeout = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
      timeoutMs: 5,
    }, { invokeCandidate: neverSettles });
    assert.equal(timeout.reason, "timeout");
    assert.strictEqual(timeout.decision, primaryAnswer);

    const controller = new AbortController();
    controller.abort();
    const aborted = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
      signal: controller.signal,
    }, { invokeCandidate: neverSettles });
    assert.equal(aborted.adopted, false);
    assert.equal(aborted.reason, "provider_failure");
    assert.strictEqual(aborted.decision, primaryAnswer);
  });

  it("falls back unchanged on provider failure without exposing task, receipt, or database outputs", async () => {
    const result = await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "解释线性代数",
      primary: primaryAnswer,
    }, {
      invokeCandidate: async () => candidate({ failureKind: "provider", schemaValid: undefined }),
    });
    assert.equal(result.reason, "provider_failure");
    assert.strictEqual(result.decision, primaryAnswer);
    assert.deepEqual(Object.keys(result).sort(), ["adopted", "decision", "latencyMs", "reason"]);
  });

  it("collector stores only sanitized decision metadata", async () => {
    await resolveRouterCanaryRouting({
      actor: "admin",
      context: { hasActivePlans: false, hasChecklists: false, hasMemories: false, now: "2026-07-11" },
      message: "raw prompt sk-secret Bearer provider response hidden reasoning",
      primary: primaryAnswer,
    }, { invokeCandidate: async () => candidate() });
    const entry = getRouterCanaryCollectorEntries()[0];
    assert.ok(entry);
    assert.deepEqual(Object.keys(entry).sort(), [
      "adopted",
      "candidateIntent",
      "latencyMs",
      "primaryIntent",
      "reason",
      "timestamp",
    ]);
    const serialized = JSON.stringify(entry);
    for (const forbidden of ["raw prompt", "sk-secret", "Bearer", "provider response", "hidden reasoning"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});
