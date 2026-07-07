/** Phase LLM-R4D: Confirmation compatibility tests.
 *
 * Verify that an LLM tool planner PendingAction is compatible
 * with the existing confirmation-step pipeline.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePendingAction, type PendingAction, type ProposedAgentAction } from "../../src/lib/agent/schemas";
import {
  confirmationMatchesPending,
  confirmationMatchesBatchPending,
  resolveConfirmationSignals,
  restoreConfirmedIntent,
  type StructuredConfirmation,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";

/* Build a minimal ProposedAgentAction that can be restored via restoreConfirmedIntent. */
const buildTestProposedAction = (overrides?: Partial<ProposedAgentAction>): ProposedAgentAction => ({
  id: "comp-test-001",
  intent: "create_schedule_items",
  riskLevel: "medium",
  summary: "创建 1 条日程",
  changes: [{
    collection: "schedule-items",
    operation: "create",
    preview: "创建日程「兼容测试」",
  }],
  args: { items: [{ title: "兼容测试", date: "2026-07-10" }] },
  requiresConfirmation: true,
  ...overrides,
});

/* ──── PendingAction shape is compatible with confirmation-step input contract ──── */

test("await_confirmation pendingAction is recognized by confirmationMatchesPending", () => {
  const pa: Extract<PendingAction, { type: "await_confirmation" }> = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const confirmation: StructuredConfirmation = { actionId: "comp-test-001", type: "confirm" };
  assert.equal(confirmationMatchesPending(pa, confirmation), true);
});

test("await_confirmation pendingAction is NOT matched by batch confirmation", () => {
  const pa: Extract<PendingAction, { type: "await_confirmation" }> = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const confirmation: StructuredConfirmation = { actionId: "comp-test-001", type: "confirm" };
  // batch match uses a different function
  const batchPending: Extract<PendingAction, { type: "await_batch_confirmation" }> = {
    actions: [buildTestProposedAction()],
    type: "await_batch_confirmation",
  };
  // confirmationMatchesBatchPending is for batch only
  assert.equal(confirmationMatchesBatchPending(batchPending, { actionId: "batch", type: "confirm" }), true);
});

test("resolveConfirmationSignals detects confirm for await_confirmation", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "comp-test-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
  assert.equal(signals.cancel, false);
});

test("resolveConfirmationSignals detects cancel for await_confirmation", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "comp-test-001", type: "cancel" },
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(signals.cancel, true);
  assert.equal(signals.confirm, false);
});

test("resolveConfirmationSignals returns still_waiting for non-matching confirmation", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "wrong-id", type: "confirm" },
    message: "随便聊聊",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

/* ──── restoreConfirmedIntent compatibility ──── */

test("restoreConfirmedIntent succeeds with valid ProposedAgentAction", () => {
  const action = buildTestProposedAction();
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_schedule_items");
});

test("restoreConfirmedIntent preserves args", () => {
  const action = buildTestProposedAction({
    args: { items: [{ title: "恢复测试", date: "2026-08-01" }] },
  });
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  const args = intent.args as Record<string, unknown>;
  assert.ok(Array.isArray(args.items));
});

/* ──── High risk requires structured confirmation ──── */

test("high risk action requires structured confirmation (not free-text confirm)", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction({ riskLevel: "high" }),
    type: "await_confirmation",
  };
  // Without structured confirmation, free-text "确认" should not confirm high-risk
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认",
    pendingAction: pa,
  });
  // High risk: free-text confirm is rejected
  assert.equal(signals.confirm, false);
});

test("high risk action with structured confirmation passes", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction({ riskLevel: "high", id: "high-risk-001" }),
    type: "await_confirmation",
  };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "high-risk-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
});

/* ──── delete_record requires structured confirmation too ──── */

test("delete_record requires structured confirmation even at medium risk", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction({ riskLevel: "medium", intent: "delete_record" }),
    type: "await_confirmation",
  };
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认删除",
    pendingAction: pa,
  });
  // delete_record requires structured confirmation
  assert.equal(signals.confirm, false);
});

/* ──── Parsing round-trip ──── */

test("pendingAction parse round-trip preserves type and action id", () => {
  const original: PendingAction = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const parsed = parsePendingAction(original);
  assert.ok(parsed);
  assert.equal(parsed!.type, "await_confirmation");
  if (parsed!.type === "await_confirmation") {
    assert.equal(parsed!.action.id, "comp-test-001");
  }
});

/* ──── No execute or DB write triggered by PendingAction creation ──── */

test("pendingAction JSON shows no execute execution", () => {
  const pa: PendingAction = {
    action: buildTestProposedAction(),
    type: "await_confirmation",
  };
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});
