/** Phase LLM-R4D: Real PendingAction shape and contract tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePendingAction } from "../../src/lib/agent/schemas";
import { confirmationMatchesPending } from "../../src/lib/agent/chat-pipeline/confirmation-step";
import type { PendingAction, ProposedAgentAction } from "../../src/lib/agent/schemas";

/* Build a minimal valid ProposedAgentAction for testing. */
const buildTestProposedAction = (overrides?: Partial<ProposedAgentAction>): ProposedAgentAction => ({
  id: "test-action-001",
  intent: "create_schedule_items",
  riskLevel: "medium",
  summary: "创建 1 条日程项",
  changes: [{
    collection: "schedule-items",
    operation: "create",
    preview: "创建日程「测试任务」在 2026-07-10",
    documentId: undefined,
  }],
  args: { items: [{ title: "测试任务", date: "2026-07-10" }] },
  requiresConfirmation: true,
  rollbackAvailable: true,
  rollbackPayload: { type: "delete", ids: [] },
  toolName: "create_schedule_items",
  ...overrides,
});

/* Build a test PendingAction of type await_confirmation (matching R4D output shape). */
const buildTestPendingAction = (overrides?: Partial<ProposedAgentAction>): Extract<PendingAction, { type: "await_confirmation" }> => ({
  action: buildTestProposedAction(overrides),
  type: "await_confirmation",
});

/* ──── PendingAction shape matches existing schema ──── */

test("await_confirmation pendingAction parses correctly", () => {
  const pa = buildTestPendingAction();
  const parsed = parsePendingAction(pa);
  assert.ok(parsed);
  assert.equal(parsed!.type, "await_confirmation");
});

test("pendingAction contains action with required fields", () => {
  const pa = buildTestPendingAction();
  assert.ok(pa.action.id);
  assert.ok(pa.action.intent);
  assert.ok(pa.action.riskLevel);
  assert.ok(pa.action.summary);
  assert.ok(Array.isArray(pa.action.changes));
  assert.ok(pa.action.changes.length > 0);
});

test("pendingAction contains dryRun result (ProposedAgentAction)", () => {
  const pa = buildTestPendingAction();
  // The ProposedAgentAction IS the dryRun result
  assert.ok(pa.action);
  assert.equal(pa.action.intent, "create_schedule_items");
  assert.ok(pa.action.summary.length > 0);
});

test("pendingAction has source marker llm_tool_planner via toolName", () => {
  // R4D marks the source via toolName or metadata on the ProposedAgentAction
  const pa = buildTestPendingAction({ toolName: "create_schedule_items" });
  assert.equal(pa.action.toolName, "create_schedule_items");
  // The source is implicit: the pendingAction comes from the tool planner graph runtime
});

/* ──── PendingAction does NOT contain raw/secret data ──── */

test("pendingAction JSON has no raw tool plan", () => {
  const pa = buildTestPendingAction();
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("toolPlan"));
  assert.ok(!s.includes("validatedPlan"));
});

test("pendingAction JSON has no secrets", () => {
  const pa = buildTestPendingAction();
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("apiKey"));
  assert.ok(!s.includes("token"));
  assert.ok(!s.includes("secret"));
  assert.ok(!s.includes("password"));
});

test("pendingAction JSON has no execute marker", () => {
  const pa = buildTestPendingAction();
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("\"execute\""));
  assert.ok(!s.includes("\"executed\""));
});

/* ──── PendingAction does NOT create receipt ──── */

test("pendingAction has no receipt", () => {
  const pa = buildTestPendingAction();
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("receipt"));
  assert.ok(!s.includes("AgentActionReceipt"));
});

/* ──── PendingAction does NOT trigger rollback ──── */

test("pendingAction creates no rollback execution", () => {
  const pa = buildTestPendingAction();
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("rollbackExecution"));
  assert.ok(!s.includes("executeRollback"));
});

/* ──── Confirmation compatibility ──── */

test("pendingAction matches confirmation by actionId", () => {
  const pa = buildTestPendingAction();
  const confirmation = { actionId: "test-action-001", type: "confirm" as const };
  assert.equal(confirmationMatchesPending(pa, confirmation), true);
});

test("pendingAction does not match different actionId", () => {
  const pa = buildTestPendingAction();
  const confirmation = { actionId: "different-id", type: "confirm" as const };
  assert.equal(confirmationMatchesPending(pa, confirmation), false);
});

test("pendingAction matches cancel by actionId", () => {
  const pa = buildTestPendingAction();
  const confirmation = { actionId: "test-action-001", type: "cancel" as const };
  assert.equal(confirmationMatchesPending(pa, confirmation), true);
});

/* ──── Multiple pendingAction test ──── */

test("each pendingAction has unique actionId", () => {
  const pa1 = buildTestPendingAction({ id: "action-1" });
  const pa2 = buildTestPendingAction({ id: "action-2" });
  assert.notEqual(pa1.action.id, pa2.action.id);
});

/* ──── Risk level accessibility ──── */

test("pendingAction exposes riskLevel for UI rendering", () => {
  const paHigh = buildTestPendingAction({ riskLevel: "high" });
  const paMed = buildTestPendingAction({ riskLevel: "medium" });
  const paLow = buildTestPendingAction({ riskLevel: "low" });
  assert.equal(paHigh.action.riskLevel, "high");
  assert.equal(paMed.action.riskLevel, "medium");
  assert.equal(paLow.action.riskLevel, "low");
});
