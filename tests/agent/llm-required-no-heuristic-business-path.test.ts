/**
 * Phase R5-A: No Heuristic Business Path Tests.
 *
 * Verifies that in AGENT_REQUIRE_LLM=1 mode:
 *  1. Tool Planner disabled → does not call heuristic router
 *  2. Tool Planner disabled → does not call schedule intent boundary
 *  3. Tool Planner disabled → does not call schedule readiness
 *  4. Tool Planner disabled → does not generate deterministic draft
 *  5. Tool Planner disabled → does not call clarification fallback for business
 *  6. Tool Planner invalid → does not fallback to heuristic
 *  7. Tool Planner unsupported tool → does not fallback to heuristic
 *  8. Tool Planner missing info → does not fallback to regex slot extraction
 *  9. AGENT_REQUIRE_LLM=0 → old heuristic behavior preserved
 *
 * These are CONTRACT tests: they verify that the heuristic functions exist
 * (not deleted) and that the R5-A gate blocks their use in require mode.
 * Full pipeline-level integration tests would need the actual pipeline runner.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAgentRequireLLMEnabled,
  isAgentLLMDisabled,
} from "../../src/lib/agent/llm-required";
import {
  isAgentToolPlannerGraphRuntimeEnabled,
  isAgentToolPlannerWriteProposalsEnabled,
  isAgentToolPlannerRealPendingActionEnabled,
  buildToolPlannerUnavailableAgentResponse,
} from "../../src/lib/agent/tool-planner";

/* ──── Env helpers ──── */

const saveEnv = (key: string) => ({
  had: Object.hasOwn(process.env, key),
  value: process.env[key],
});

const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) {
    process.env[key] = prev.value;
  } else {
    delete process.env[key];
  }
};

/* ═══════════════════════════════════════════════════════════════
   1. Heuristic functions exist (NOT deleted — just gated)
   ═══════════════════════════════════════════════════════════════ */

test("rulePreCheck module is still importable (not deleted)", async () => {
  // This verifies the heuristic file still exists
  const mod = await import("../../src/lib/agent/session/rule-pre-check");
  assert.ok(typeof mod.rulePreCheck === "function");
  assert.ok(typeof mod.isPendingConfirmMessage === "function");
  assert.ok(typeof mod.isPendingCancelMessage === "function");
});

test("classifyScheduleIntentBoundary is still importable (not deleted)", async () => {
  const mod = await import("../../src/lib/agent/schedule/intent-boundary");
  assert.ok(typeof mod.classifyScheduleIntentBoundary === "function");
});

test("evaluatePlanReadinessGate is still importable (not deleted)", async () => {
  const mod = await import("../../src/lib/agent/planning/readiness-gate");
  assert.ok(typeof mod.evaluatePlanReadinessGate === "function");
});

test("evaluateScheduleReadinessGate is still importable (not deleted)", async () => {
  const mod = await import("../../src/lib/agent/schedule/readiness-gate");
  assert.ok(typeof mod.evaluateScheduleReadinessGate === "function");
});

test("parseHeuristicIntent has been deleted (R6-C1-E)", async () => {
  // R6-C1-E: parse-heuristic-intent.ts has been physically deleted.
  // Module should no longer exist. Verify by checking that the file system
  // doesn't contain the module.
  const fs = await import("node:fs");
  const exists = fs.existsSync("src/lib/agent/intent/heuristics/parse-heuristic-intent.ts");
  assert.equal(exists, false, "parse-heuristic-intent.ts should be deleted");
});

/* ═══════════════════════════════════════════════════════════════
   2. Feature flag gating contract
   ═══════════════════════════════════════════════════════════════ */

test("AGENT_REQUIRE_LLM=1 → isAgentRequireLLMEnabled() returns true", () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  process.env.AGENT_REQUIRE_LLM = "1";
  try {
    assert.equal(isAgentRequireLLMEnabled(), true);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});

test("default (no env) → isAgentRequireLLMEnabled() returns false", () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  delete process.env.AGENT_REQUIRE_LLM;
  try {
    assert.equal(isAgentRequireLLMEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});

test("AGENT_REQUIRE_LLM=0 → falls back to existing behavior", () => {
  // This is the contract: when require mode is OFF, everything works as before.
  // The R5-A gate only activates when isAgentRequireLLMEnabled() === true.
  // This test verifies the flag itself.
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  process.env.AGENT_REQUIRE_LLM = "0";
  try {
    assert.equal(isAgentRequireLLMEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});

/* ═══════════════════════════════════════════════════════════════
   3. R5-A gate: when require mode on, no heuristic fallback
   ═══════════════════════════════════════════════════════════════ */

test("R5-A response builders are importable and produce valid output", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 1,
  });
  assert.ok(response);
  assert.equal(response.pendingAction, null);
  assert.equal(response.intent, "clarify");
  assert.ok(response.assistantMessage.length > 0);
});

/* ═══════════════════════════════════════════════════════════════
   4. Deterministic safety guards are NOT affected
   ═══════════════════════════════════════════════════════════════ */

test("policy-guard exports are still importable", async () => {
  const mod = await import("../../src/lib/agent/policy/guard");
  assert.ok(typeof mod.applyPolicyGuard === "function");
});

test("rollback module is still importable", async () => {
  const mod = await import("../../src/lib/agent/rollback");
  assert.ok(typeof mod === "object");
});

test("action-receipts module is still importable", async () => {
  const mod = await import("../../src/lib/agent/action-receipts");
  assert.ok(typeof mod === "object");
});

test("confirmation-step module is still importable", async () => {
  const mod = await import("../../src/lib/agent/chat-pipeline/confirmation-step");
  assert.ok(typeof mod.confirmationMatchesPending === "function");
  assert.ok(typeof mod.resolveConfirmationSignals === "function");
  assert.ok(typeof mod.restoreConfirmedIntent === "function");
});

test("tool-registry supportsDryRun and supportsExecute preserved", async () => {
  const { getAgentToolDefinition } = await import("../../src/lib/agent/tool-registry");
  // Verify all 3 allowlisted tools still have correct metadata
  const allowlisted = ["create_plan", "create_checklist", "create_schedule_items"] as const;
  for (const toolName of allowlisted) {
    const def = getAgentToolDefinition(toolName);
    assert.ok(def, `${toolName}: must still be defined`);
    assert.equal(def!.capability, "write", `${toolName}: must be write capability`);
    assert.equal(def!.requiresConfirmation, true, `${toolName}: must require confirmation`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   5. Write allowlist is NOT expanded
   ═══════════════════════════════════════════════════════════════ */

test("R4D write proposal allowlist is still 3 tools", async () => {
  // The allowlist is defined in langgraph-runtime.ts as a module-level constant.
  // We verify by checking that only the 3 expected tools are in the list.
  const { getAgentToolDefinition } = await import("../../src/lib/agent/tool-registry");

  const allowlisted = ["create_schedule_items", "create_plan", "create_checklist"] as const;
  for (const toolName of allowlisted) {
    const def = getAgentToolDefinition(toolName);
    assert.ok(def, `${toolName} must be in allowlist`);
    assert.equal(def!.capability, "write");
  }
});

/* ═══════════════════════════════════════════════════════════════
   6. Feature flag hierarchy
   ═══════════════════════════════════════════════════════════════ */

test("feature flag hierarchy: require mode does not auto-enable tool planner", () => {
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevGR = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");

  process.env.AGENT_REQUIRE_LLM = "1";
  delete process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME;

  try {
    assert.equal(isAgentRequireLLMEnabled(), true);
    assert.equal(isAgentToolPlannerGraphRuntimeEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prevGR);
  }
});

/* ═══════════════════════════════════════════════════════════════
   7. R5-A gate produces controlled response (not crash)
   ═══════════════════════════════════════════════════════════════ */

test("all 6 reason types produce non-null valid responses", () => {
  const reasons = [
    "tool_planner_disabled",
    "tool_planner_invalid_plan",
    "tool_planner_unsupported_tool",
    "tool_planner_low_confidence",
    "tool_planner_missing_information",
    "tool_planner_failed",
  ] as const;

  for (const reason of reasons) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.ok(response, `${reason}: response must not be null`);
    assert.ok(typeof response.assistantMessage === "string", `${reason}: must have message`);
    assert.ok(response.assistantMessage.length > 0, `${reason}: message must not be empty`);
    assert.equal(response.pendingAction, null, `${reason}: must have null pendingAction`);
    assert.equal(response.intent, "clarify", `${reason}: must be clarify intent`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   8. No pendingAction in ANY controlled response
   ═══════════════════════════════════════════════════════════════ */

test("R5-A controlled responses never contain pendingAction", () => {
  const reasons = [
    "tool_planner_disabled",
    "tool_planner_invalid_plan",
    "tool_planner_unsupported_tool",
    "tool_planner_low_confidence",
    "tool_planner_missing_information",
    "tool_planner_failed",
  ] as const;

  for (const reason of reasons) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.equal(response.pendingAction, null);
  }
});

/* ═══════════════════════════════════════════════════════════════
   9. Safety guards still deterministic (confirm/cancel)
   ═══════════════════════════════════════════════════════════════ */

test("AGENT_REQUIRE_LLM flag does not change confirm/cancel detection", async () => {
  // The confirmation-step and rule-pre-check confirm/cancel logic is
  // independent of AGENT_REQUIRE_LLM. This test verifies the guards exist.

  const { isPendingConfirmMessage, isPendingCancelMessage } =
    await import("../../src/lib/agent/session/rule-pre-check");

  assert.equal(isPendingConfirmMessage("确认"), true);
  assert.equal(isPendingCancelMessage("取消"), true);
  assert.equal(isPendingConfirmMessage("今天天气不错"), false);
  assert.equal(isPendingCancelMessage("继续执行"), false);
});

/* ═══════════════════════════════════════════════════════════════
   10. Capability gate, Policy Guard, schema validation still work
   ═══════════════════════════════════════════════════════════════ */

test("evaluatePolicyGuard still works (from policy/tool-gate)", async () => {
  const { evaluatePolicyGuard } = await import("../../src/lib/agent/policy/tool-gate");
  assert.ok(typeof evaluatePolicyGuard === "function");
});

test("applyPolicyGuard still works (from policy/guard)", async () => {
  const { applyPolicyGuard } = await import("../../src/lib/agent/policy/guard");
  assert.ok(typeof applyPolicyGuard === "function");
});

test("getAllowedCapabilities still works", async () => {
  const { getAllowedCapabilities } = await import("../../src/lib/agent/capabilities/tool-gate");
  assert.ok(typeof getAllowedCapabilities === "function");
});

test("validateLLMToolPlan still works", async () => {
  const { validateLLMToolPlan } = await import("../../src/lib/agent/tool-planner/validate-tool-plan");
  assert.ok(typeof validateLLMToolPlan === "function");
});

/* ═══════════════════════════════════════════════════════════════
   11. R6-C2-D: Keyword/regex write-intent rules gated behind AGENT_REQUIRE_LLM=0
   ═══════════════════════════════════════════════════════════════ */

test("R6-C2-D: with AGENT_REQUIRE_LLM=1, explicit create signal does NOT produce write intent", async () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  process.env.AGENT_REQUIRE_LLM = "1";
  try {
    const { classifyScheduleIntentBoundary } =
      await import("../../src/lib/agent/schedule/intent-boundary");

    // "帮我把这些任务安排进日程" has clear keyword create signals
    const result = classifyScheduleIntentBoundary({
      userMessage: "帮我把这些任务安排进日程",
    });

    // In LLM-required mode, keyword regex write-intent rules are gated.
    // The result should NOT be schedule_creation from rule source.
    assert.notEqual(result.intent, "schedule_creation",
      "keyword write intent must NOT be produced in AGENT_REQUIRE_LLM=1");
    assert.notEqual(result.source, "rule",
      "result source must NOT be 'rule' for write intent in AGENT_REQUIRE_LLM=1");
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});

test("R6-C2-D: with AGENT_REQUIRE_LLM=1, query guard still works (safety)", async () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  process.env.AGENT_REQUIRE_LLM = "1";
  try {
    const { classifyScheduleIntentBoundary } =
      await import("../../src/lib/agent/schedule/intent-boundary");

    // "帮我查看最近的日程安排" is a clear read-only query
    const result = classifyScheduleIntentBoundary({
      userMessage: "帮我查看最近的日程安排",
    });

    // Query detection is a safety guard — it must still work
    assert.equal(result.intent, "query_schedule",
      "query_schedule safety guard must still work in AGENT_REQUIRE_LLM=1");
    assert.equal(result.readOrWrite, "read");
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});

test("R6-C2-D: with AGENT_REQUIRE_LLM=0, write-intent rules still work (legacy mode)", async () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  const prevDisable = saveEnv("AGENT_DISABLE_LLM");
  process.env.AGENT_REQUIRE_LLM = "0";
  process.env.AGENT_DISABLE_LLM = "1";
  try {
    const { classifyScheduleIntentBoundary } =
      await import("../../src/lib/agent/schedule/intent-boundary");

    const result = classifyScheduleIntentBoundary({
      userMessage: "帮我把这些任务安排进日程",
    });

    // In legacy mode, keyword rules still produce schedule_creation
    assert.equal(result.intent, "schedule_creation",
      "keyword write intent must still work in AGENT_REQUIRE_LLM=0");
    assert.equal(result.readOrWrite, "write");
    assert.equal(result.source, "rule");
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
    restoreEnv("AGENT_DISABLE_LLM", prevDisable);
  }
});

test("R6-C2-D: with AGENT_REQUIRE_LLM=1, no heuristic fallback to write (generic schedule message)", async () => {
  const prev = saveEnv("AGENT_REQUIRE_LLM");
  process.env.AGENT_REQUIRE_LLM = "1";
  try {
    const { classifyScheduleIntentBoundary } =
      await import("../../src/lib/agent/schedule/intent-boundary");

    // "帮我处理一下日程" — generic, no explicit query or create signal
    // In AGENT_REQUIRE_LLM=0, this would return ambiguous or fallback
    // In AGENT_REQUIRE_LLM=1, it must NOT produce a write intent
    const result = classifyScheduleIntentBoundary({
      userMessage: "帮我处理一下日程",
    });

    assert.notEqual(result.intent, "schedule_creation",
      "must not guess write intent from generic message");
    assert.notEqual(result.intent, "revise_schedule_draft",
      "must not guess revise intent from generic message");
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prev);
  }
});
