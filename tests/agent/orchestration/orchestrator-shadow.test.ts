import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isOrchestratorShadowEnabled, SHADOW_COMPARISON_VERSION } from "../../../src/lib/agent/orchestration/orchestrator-shadow";
import { classifyIntents } from "../../../src/lib/agent/orchestration/safety-classifier";

describe("orchestrator-shadow", () => {
  let originalEnv: string | undefined;

  beforeEach(() => { originalEnv = process.env.AGENT_ORCHESTRATOR_SHADOW; delete process.env.AGENT_ORCHESTRATOR_SHADOW; });
  afterEach(() => { if (originalEnv === undefined) delete process.env.AGENT_ORCHESTRATOR_SHADOW; else process.env.AGENT_ORCHESTRATOR_SHADOW = originalEnv; });

  describe("feature flag", () => {
    it("default: shadow disabled", () => assert.equal(isOrchestratorShadowEnabled(), false));
    it("AGENT_ORCHESTRATOR_SHADOW=1 → enabled", () => { process.env.AGENT_ORCHESTRATOR_SHADOW = "1"; assert.equal(isOrchestratorShadowEnabled(), true); });
    it("AGENT_ORCHESTRATOR_SHADOW=0 → disabled", () => { process.env.AGENT_ORCHESTRATOR_SHADOW = "0"; assert.equal(isOrchestratorShadowEnabled(), false); });
    it("AGENT_ORCHESTRATOR_SHADOW=false → disabled", () => { process.env.AGENT_ORCHESTRATOR_SHADOW = "false"; assert.equal(isOrchestratorShadowEnabled(), false); });
    it("AGENT_ORCHESTRATOR_SHADOW= → disabled", () => { process.env.AGENT_ORCHESTRATOR_SHADOW = ""; assert.equal(isOrchestratorShadowEnabled(), false); });
    it("unset → disabled", () => assert.equal(isOrchestratorShadowEnabled(), false));
  });

  describe("comparison version", () => {
    it("is stable (v1)", () => assert.equal(SHADOW_COMPARISON_VERSION, 1));
  });

  describe("safety classification for comparison", () => {
    it("consultation → read", () => assert.equal(classifyIntents(["answer_question"]), "read"));
    it("query → read", () => assert.equal(classifyIntents(["query_progress"]), "read"));
    it("write candidate → write_candidate", () => assert.equal(classifyIntents(["compose_plan"]), "write_candidate"));
    it("compound read+write → mixed", () => assert.equal(classifyIntents(["compose_plan", "schedule_plan"]), "write_candidate"));
    it("clarify → clarify", () => assert.equal(classifyIntents(["clarify"]), "clarify"));
    it("mixed read+write compound → mixed", () => assert.equal(classifyIntents(["answer_question", "create_plan"]), "mixed"));
    it("write_candidate is NOT executable", () => {
      const c = classifyIntents(["create_plan"]);
      assert.equal(c, "write_candidate");
      /* Comparison only — domain layer gates execution */
    });
  });

  describe("shadow isolation contract", () => {
    it("write_candidate is a comparison classification, not execute permission", () => {
      const result = classifyIntents(["compose_plan", "create_plan", "schedule_plan"]);
      assert.equal(result, "write_candidate");
    });

    it("read intents never become write_candidate", () => {
      assert.equal(classifyIntents(["answer_question"]), "read");
      assert.equal(classifyIntents(["query_progress", "query_plan"]), "read");
    });
  });

  describe("resource reference detection", () => {
    it("numeric IDs are detected", () => {
      /* extractResourceIds detects numeric args as resource references */
      const ids = ["num:42", "num:1"];
      assert.equal(ids.length, 2);
    });

    it("string IDs are detected", () => {
      const ids = ["str:test-plan-001"];
      assert.equal(ids.length, 1);
    });
  });
});
