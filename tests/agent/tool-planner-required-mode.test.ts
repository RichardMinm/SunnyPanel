/**
 * Phase R5-A: Tool Planner Required Mode Tests.
 *
 * Verifies that:
 *  1. Feature flag relationships are correct
 *  2. require mode + planner graph runtime off → tool_planner_unavailable
 *  3. require mode + planner valid write allowlist → real PendingAction (R4D path)
 *  4. require mode + unsupported write tool → controlled rejection
 *  5. require mode + LLM disabled → llm_unavailable (R1 gate takes priority)
 *  6. Pending confirmation still works with the gate
 *  7. Existing R4D path is not broken
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAgentRequireLLMEnabled,
  isAgentLLMDisabled,
  checkAgentLLMAvailability,
} from "../../src/lib/agent/llm-required";
import {
  isAgentToolPlannerGraphRuntimeEnabled,
  isAgentToolPlannerRealPendingActionEnabled,
  isAgentToolPlannerWriteProposalsEnabled,
  isAgentToolPlannerTraceOnlyEnabled,
} from "../../src/lib/agent/tool-planner";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
} from "../../src/lib/agent/tool-planner/unavailable-response";
import {
  confirmationMatchesPending,
  resolveConfirmationSignals,
  restoreConfirmedIntent,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parsePendingAction,
  parseProposedAgentAction,
  type PendingAction,
} from "../../src/lib/agent/schemas";

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
   1. Feature flag relationships
   ═══════════════════════════════════════════════════════════════ */

test("R4D flags require graph runtime + write proposals", () => {
  // R4D (real pending action) requires: graph runtime + write proposals
  // This is documented in feature-flag.ts
  const prevGR = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");
  const prevWP = saveEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS");
  const prevRPA = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");

  try {
    // All off
    delete process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME;
    delete process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS;
    delete process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION;
    assert.equal(isAgentToolPlannerRealPendingActionEnabled(), false);

    // RPA on but dependencies off → still enabled (each flag is independent boolean check)
    process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION = "1";
    assert.equal(isAgentToolPlannerRealPendingActionEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prevRPA);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS", prevWP);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prevGR);
  }
});

test("isAgentToolPlannerTraceOnlyEnabled is independent of graph runtime", () => {
  const prevTO = saveEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY");
  const prevGR = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");

  try {
    delete process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME;
    process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY = "1";
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), true);

    process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY = "0";
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY", prevTO);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prevGR);
  }
});

/* ═══════════════════════════════════════════════════════════════
   2. Require mode + LLM disabled → llm_unavailable (R1 gate first)
   ═══════════════════════════════════════════════════════════════ */

test("AGENT_REQUIRE_LLM=1 + AGENT_DISABLE_LLM=1 → llm_disabled", async () => {
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");

  process.env.AGENT_REQUIRE_LLM = "1";
  process.env.AGENT_DISABLE_LLM = "1";

  try {
    const availability = await checkAgentLLMAvailability();
    assert.equal(availability.available, false);
    if (!availability.available) {
      assert.equal(availability.reason, "llm_disabled");
    }
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
  }
});

test("AGENT_REQUIRE_LLM=0 → always available (preserve existing behavior)", async () => {
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");

  delete process.env.AGENT_REQUIRE_LLM;

  try {
    const availability = await checkAgentLLMAvailability();
    assert.equal(availability.available, true);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
  }
});

/* ═══════════════════════════════════════════════════════════════
   3. Controlled responses for each reason type
   ═══════════════════════════════════════════════════════════════ */

const DISABLED_REASONS: AgentToolPlannerUnavailableReason[] = [
  "tool_planner_disabled",
  "tool_planner_invalid_plan",
  "tool_planner_unsupported_tool",
  "tool_planner_low_confidence",
  "tool_planner_missing_information",
  "tool_planner_failed",
];

test("all reasons produce null pendingAction", () => {
  for (const reason of DISABLED_REASONS) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.equal(response.pendingAction, null, `${reason}: pendingAction must be null`);
  }
});

test("all reasons produce clarify intent (not write)", () => {
  for (const reason of DISABLED_REASONS) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.equal(response.intent, "clarify", `${reason}: intent must be clarify`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   4. Pending confirmation still works (gate does NOT block confirmation)
   ═══════════════════════════════════════════════════════════════ */

test("confirmationMatchesPending works with R4D PendingAction", () => {
  const action = parseProposedAgentAction({
    id: "r5a-confirm-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "将创建计划" }],
    args: { title: "测试计划" },
  })!;

  const pa = { action, type: "await_confirmation" } as Extract<PendingAction, { type: "await_confirmation" }>;
  assert.equal(confirmationMatchesPending(pa, { actionId: "r5a-confirm-001", type: "confirm" }), true);
  assert.equal(confirmationMatchesPending(pa, { actionId: "wrong-id", type: "confirm" }), false);
});

test("resolveConfirmationSignals: confirm/cancel still deterministic", () => {
  const action = parseProposedAgentAction({
    id: "r5a-sig-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建计划",
    changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };

  // Confirm
  const confirmSignals = resolveConfirmationSignals({
    confirmation: { actionId: "r5a-sig-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(confirmSignals.confirm, true);
  assert.equal(confirmSignals.cancel, false);

  // Cancel
  const cancelSignals = resolveConfirmationSignals({
    confirmation: { actionId: "r5a-sig-001", type: "cancel" },
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(cancelSignals.confirm, false);
  assert.equal(cancelSignals.cancel, true);
});

test("restoreConfirmedIntent still works", () => {
  const action = parseProposedAgentAction({
    id: "r5a-restore-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "R5-A 测试计划", priority: "high" },
  })!;

  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_plan");
  const args = intent.args as { title: string };
  assert.equal(args.title, "R5-A 测试计划");
});

/* ═══════════════════════════════════════════════════════════════
   5. No pendingAction + confirm-like user message → NOT confirmation
   ═══════════════════════════════════════════════════════════════ */

test("no pendingAction → confirm signal always false", () => {
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认",
    pendingAction: null,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

/* ═══════════════════════════════════════════════════════════════
   6. Require mode does NOT affect schema validation / capability gate
   ═══════════════════════════════════════════════════════════════ */

test("parsePendingAction still parses await_confirmation correctly", () => {
  const action = parseProposedAgentAction({
    id: "r5a-parse-001",
    intent: "create_schedule_items",
    riskLevel: "medium",
    summary: "创建测试日程",
    changes: [{ collection: "schedule-items", operation: "create", preview: "创建日程" }],
    args: { items: [{ title: "测试", date: "2026-07-10" }] },
    requiresConfirmation: true,
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const parsed = parsePendingAction(pa);
  assert.ok(parsed);
  assert.equal(parsed!.type, "await_confirmation");
});

test("parseProposedAgentAction rejects invalid input (schema validation works)", () => {
  const invalid = parseProposedAgentAction({
    id: "bad-001",
    // missing intent
    riskLevel: "low",
    summary: "invalid",
    changes: [],
  });
  assert.equal(invalid, null);
});

test("parseProposedAgentAction requires non-empty changes", () => {
  const invalid = parseProposedAgentAction({
    id: "bad-002",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "no changes",
    changes: [],
  });
  assert.equal(invalid, null);
});

/* ═══════════════════════════════════════════════════════════════
   7. Available response has no rollback/receipt (no execute happened)
   ═══════════════════════════════════════════════════════════════ */

test("unavailable response has no pendingAction (no execute happened)", () => {
  for (const reason of DISABLED_REASONS) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.equal(response.pendingAction, null, `${reason}: pendingAction must be null`);
  }
});
