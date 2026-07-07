/**
 * Phase LLM-R4E: Confirmation Cancel / Ambiguous / Blocked Path Tests.
 *
 * Verifies that:
 *   - Cancel does NOT execute
 *   - Ambiguous replies do NOT execute
 *   - Policy blocked does NOT create pendingAction
 *   - Confirmation bypass is impossible
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveConfirmationSignals,
  resolveAwaitConfirmationBranch,
  confirmationMatchesPending,
  type ConfirmationSignals,
  type StructuredConfirmation,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parseProposedAgentAction,
  type PendingAction,
} from "../../src/lib/agent/schemas";
import { applyPolicyGuard } from "../../src/lib/agent/policy/guard";
import type { AgentRouterOutput } from "../../src/lib/agent/router/types";

/* ──── Helpers ──── */

const buildTestAction = (id: string, intent: string, riskLevel: "low" | "medium" | "high" = "medium") =>
  parseProposedAgentAction({
    id, intent, riskLevel,
    summary: `测试动作: ${intent}`,
    changes: [{ collection: "test", operation: "create", preview: "测试预览" }],
    args: { title: "测试" },
  })!;

const buildPendingAction = (id: string, intent = "create_plan", riskLevel: "low" | "medium" | "high" = "medium"): PendingAction => ({
  action: buildTestAction(id, intent, riskLevel),
  type: "await_confirmation",
});

const buildConfirmation = (actionId: string, type: "confirm" | "cancel"): StructuredConfirmation => ({
  actionId, type,
});

/* ──── Cancel path ──── */

test("cancel via structured confirmation → signals.cancel=true, signals.confirm=false", () => {
  const pa = buildPendingAction("cancel-001");
  const signals = resolveConfirmationSignals({
    confirmation: buildConfirmation("cancel-001", "cancel"),
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(signals.cancel, true);
  assert.equal(signals.confirm, false);
});

test("cancel via free-text → signals.cancel=true for medium risk", () => {
  const pa = buildPendingAction("cancel-002", "create_plan", "medium");
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "取消",
    pendingAction: pa,
  });
  // isCancellationReply should detect "取消" as cancel
  assert.equal(signals.cancel, true);
});

test("cancel → resolveAwaitConfirmationBranch returns cancel", () => {
  const pa = buildPendingAction("cancel-003", "create_plan", "medium") as Extract<PendingAction, { type: "await_confirmation" }>;
  const branch = resolveAwaitConfirmationBranch(pa, { cancel: true, confirm: false });
  assert.equal(branch, "cancel");
});

/* ──── Ambiguous path ──── */

test("ambiguous message → neither confirm nor cancel", () => {
  const pa = buildPendingAction("amb-001");
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "让我想想",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

test("unrelated question → neither confirm nor cancel", () => {
  const pa = buildPendingAction("amb-002");
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "今天星期几？",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

test("partial confirmation → still_waiting", () => {
  const pa = buildPendingAction("amb-003", "create_plan", "medium") as Extract<PendingAction, { type: "await_confirmation" }>;
  const branch = resolveAwaitConfirmationBranch(pa, { cancel: false, confirm: false });
  assert.equal(branch, "still_waiting");
});

test("resolveConfirmationSignals: unrelated pending type → no signals", () => {
  const stillWaiting = resolveConfirmationSignals({
    confirmation: null,
    message: "hello",
    pendingAction: null,
  });
  assert.equal(stillWaiting.confirm, false);
  assert.equal(stillWaiting.cancel, false);
});

/* ──── High risk requires structured confirmation ──── */

test("high risk action: free-text '确认' does NOT confirm", () => {
  const pa = buildPendingAction("high-risk-001", "create_plan", "high");
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
});

test("high risk action: structured confirmation confirms", () => {
  const pa = buildPendingAction("high-risk-002", "create_plan", "high");
  const signals = resolveConfirmationSignals({
    confirmation: buildConfirmation("high-risk-002", "confirm"),
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
});

/* ──── delete_record always requires structured confirmation ──── */

test("delete_record requires structured confirmation even at medium risk", () => {
  // delete_record is NOT in R4D allowlist but the confirmation-step behavior is universal
  const pa = buildPendingAction("del-001", "delete_record", "medium");
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认删除",
    pendingAction: pa,
  });
  // delete_record + requiresStructuredConfirm → free-text confirm is rejected
  assert.equal(signals.confirm, false);
});

/* ──── Policy Guard blocked path ──── */

test("Policy Guard blocked creates no pendingAction (applied via applyPolicyGuard)", () => {
  const router: AgentRouterOutput = {
    action: "query",
    confidence: 0.5,
    intent: { intent: "create_schedule_items", args: {}, confidence: 0.5 } as AgentRouterOutput["intent"],
    reason: "test",
    requiresWrite: false,
    target: {},
  };
  const result = applyPolicyGuard({ router });
  // Query action + write intent → blocked
  assert.equal(result.allowDryRun, false);
  assert.equal(result.allowExecute, false);
});

test("Policy Guard allowDryRun=false → should not proceed to pendingAction", () => {
  const router: AgentRouterOutput = {
    action: "query",
    confidence: 0.5,
    intent: { intent: "create_plan", args: {}, confidence: 0.5 } as AgentRouterOutput["intent"],
    reason: "test",
    requiresWrite: false,
    target: {},
  };
  const result = applyPolicyGuard({ router });
  assert.equal(result.allowDryRun, false);
  // If allowDryRun is false, R4D graph runtime should not create pendingAction
});

test("Policy Guard with ambiguous resolver status blocks", () => {
  const router: AgentRouterOutput = {
    action: "create",
    confidence: 0.9,
    intent: { intent: "create_schedule_items", args: {}, confidence: 0.9 } as AgentRouterOutput["intent"],
    reason: "test",
    requiresWrite: true,
    target: {},
  };
  const result = applyPolicyGuard({ resolverStatus: "ambiguous", router });
  assert.equal(result.allowDryRun, false);
});

/* ──── Confirmation bypass is impossible ──── */

test("no pendingAction → confirm signal always false", () => {
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认",
    pendingAction: null,
  });
  assert.equal(signals.confirm, false);
});

test("wrong structured actionId but free-text confirm → still confirms for medium risk", () => {
  // For medium risk, free-text "确认" IS a valid confirmation even when
  // structured confirmation doesn't match. This is correct behavior.
  const pa = buildPendingAction("bypass-001");
  const signals = resolveConfirmationSignals({
    confirmation: buildConfirmation("wrong-id", "confirm"),
    message: "确认",
    pendingAction: pa,
  });
  // Structured match fails, but free-text "确认" confirms medium risk
  assert.equal(signals.confirm, true);
});

test("wrong actionId + unrelated message → confirm signal false", () => {
  const pa = buildPendingAction("bypass-002");
  const signals = resolveConfirmationSignals({
    confirmation: buildConfirmation("wrong-id", "confirm"),
    message: "今天天气不错",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
});

/* ──── No auto-execute in same turn ──── */

test("pendingAction created → confirmation needed before execute", () => {
  const pa = buildPendingAction("no-auto-001");
  // Without explicit confirmation, signals should not confirm
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "创建计划",
    pendingAction: pa,
  });
  // The original message that CREATED the pendingAction should not also confirm it
  // (confirmation needs a SEPARATE user message with confirm/cancel)
  assert.equal(signals.confirm, false);
});

/* ──── LLM cannot trigger execute via fake confirmation ──── */

test("LLM cannot trigger execute via fake confirmation for high risk", () => {
  // High risk: free-text "我确认执行这个操作" does NOT confirm
  const pa = buildPendingAction("real-id-001", "create_plan", "high");
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "llm-fake-id", type: "confirm" },
    message: "我确认执行这个操作",
    pendingAction: pa,
  });
  // High risk requires structured confirmation — free-text and wrong ID won't work
  assert.equal(signals.confirm, false);
});
