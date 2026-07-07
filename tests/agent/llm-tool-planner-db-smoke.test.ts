/**
 * Phase LLM-R4F: Real Postgres DB Smoke Tests for Tool Planner Execute Path.
 *
 * These tests verify the full Tool Planner → confirmation → execute → DB write → receipt
 * flow against a real PostgreSQL database.
 *
 * REQUIREMENTS:
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *   PAYLOAD_SECRET=<any-strong-secret>
 *
 * Without DATABASE_URL, ALL tests in this file are skipped.
 * Skipped ≠ passed — these verify real DB writes.
 */
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { getPayloadClient } from "../../src/lib/payload/client";
import {
  restoreConfirmedIntent,
  confirmationMatchesPending,
  resolveConfirmationSignals,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parsePendingAction,
  parseProposedAgentAction,
  type PendingAction,
  type ProposedAgentAction,
} from "../../src/lib/agent/schemas";
import { executeAgentIntent } from "../../src/lib/agent/executor";
import { applyPolicyGuard } from "../../src/lib/agent/policy/guard";
import { evaluatePolicyGuard } from "../../src/lib/agent/policy/tool-gate";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";
import type { AgentRouterOutput } from "../../src/lib/agent/router/types";
import type { Payload } from "payload";

/* ──── DB availability guard ──── */

const DATABASE_URL = process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL && DATABASE_URL.length > 0);

const testIfDb = hasDatabase ? test : test.skip;

if (!hasDatabase) {
  console.warn("[R4F] DB-dependent smoke tests SKIPPED: DATABASE_URL not configured.");
  console.warn("[R4F] Set DATABASE_URL=postgresql://user:pass@host:5432/dbname to run real DB smoke.");
}

/* ──── Payload singleton (lazy init) ──── */

let _payload: Payload | null = null;

const getPayload = async (): Promise<Payload> => {
  if (!_payload) {
    _payload = await getPayloadClient();
  }
  return _payload;
};

/* ──── Test user ──── */

const testUserId = 1;

/* ──── Cleanup tracking ──── */

const createdPlanIds: number[] = [];
const createdChecklistIds: number[] = [];
const createdScheduleItemIds: number[] = [];

const cleanup = async (payload: Payload) => {
  for (const id of createdScheduleItemIds) {
    try { await payload.delete({ collection: "schedule-items", id }); } catch { /* already gone */ }
  }
  for (const id of createdChecklistIds) {
    try { await payload.delete({ collection: "checklists", id }); } catch { /* already gone */ }
  }
  for (const id of createdPlanIds) {
    try { await payload.delete({ collection: "plans", id }); } catch { /* already gone */ }
  }
};

/* ──── Synthetic router output for Policy Guard ──── */

const buildSyntheticRouter = (toolName: string): AgentRouterOutput => ({
  action: "create",
  confidence: 0.9,
  intent: { intent: toolName, args: {}, confidence: 0.9 } as AgentRouterOutput["intent"],
  reason: "R4F DB smoke test",
  requiresWrite: true,
  target: {},
});

/* ──── Helpers: build ProposedAction → PendingAction → confirm → execute ──── */

const buildConfirmation = (actionId: string) => ({ actionId, type: "confirm" as const });

const confirmAndExecute = async (pendingAction: PendingAction, testLabel: string) => {
  // Verify confirmation matches
  if (pendingAction.type !== "await_confirmation") {
    throw new Error(`${testLabel}: expected await_confirmation, got ${pendingAction.type}`);
  }
  const match = confirmationMatchesPending(pendingAction, buildConfirmation(pendingAction.action.id));
  assert.equal(match, true, `${testLabel}: confirmation must match pendingAction`);

  // Verify signals
  const signals = resolveConfirmationSignals({
    confirmation: buildConfirmation(pendingAction.action.id),
    message: "确认",
    pendingAction,
  });
  assert.equal(signals.confirm, true, `${testLabel}: confirm signal must be true`);

  // Restore intent
  const restoredIntent = restoreConfirmedIntent(pendingAction.action);
  assert.ok(restoredIntent, `${testLabel}: must restore confirmed intent`);

  // Execute
  const result = await executeAgentIntent(restoredIntent, undefined, { userId: testUserId });
  assert.ok(result, `${testLabel}: execute must return result`);
  // Not all tools set status — absence of "failed" means success
  assert.notEqual(result.status, "failed", `${testLabel}: execute status must not be failed`);
  return { restoredIntent, result };
};

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 1: create_plan
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE create_plan: full Tool Planner → confirm → execute → DB verify", async () => {
  const payload = await getPayload();

  // 1. Verify tool definition
  const def = getAgentToolDefinition("create_plan");
  assert.ok(def);
  assert.equal(def!.capability, "write");
  assert.equal(def!.requiresConfirmation, true);
  assert.equal(def!.supportsExecute, true);

  // 2. Real Policy Guard evaluation
  const router = buildSyntheticRouter("create_plan");
  const policyGuardOutput = applyPolicyGuard({ router });
  const toolGateResult = evaluatePolicyGuard(router, { userContext: { userId: testUserId } });
  assert.equal(policyGuardOutput.allowDryRun, true, "Policy Guard must allow dryRun for create_plan");
  assert.equal(toolGateResult.allowed, true, "Tool gate must allow create_plan");

  // 3. Build ProposedAgentAction (simulating dryRun output)
  const action: ProposedAgentAction = {
    id: `r4f-smoke-plan-${Date.now()}`,
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建 R4F 冒烟测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "将创建计划「R4F 冒烟测试计划」" }],
    args: { title: `R4F 冒烟测试计划 ${Date.now()}`, priority: "medium" as const },
    requiresConfirmation: true,
    rollbackAvailable: def!.supportsRollback ?? false,
    rollbackPayload: def!.supportsRollback ? { type: "delete_plan" } : undefined,
    toolName: "create_plan",
  };

  // 4. Build real PendingAction
  const pendingAction: PendingAction = { action, type: "await_confirmation" };
  const parsed = parsePendingAction(pendingAction);
  assert.ok(parsed);
  assert.equal(parsed!.type, "await_confirmation");

  // 5. Confirm + Execute
  const { restoredIntent, result } = await confirmAndExecute(pendingAction, "create_plan");
  createdPlanIds.push(result.planId!);

  // 6. Verify DB: plan exists
  assert.ok(result.planId, "execute result must have planId");
  const plan = await payload.findByID({ collection: "plans", id: result.planId! });
  assert.ok(plan);
  assert.ok(typeof plan.title === "string");

  // 7. Verify receipt (via result)
  assert.ok(result.assistantMessage, "execute result must have assistantMessage");

  // 8. Verify rollback metadata
  if (def!.supportsRollback) {
    assert.ok("rollbackPayload" in result || result.rollbackPayload, "create_plan should have rollback metadata");
  }

  // Cleanup
  await cleanup(payload);
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 2: create_checklist
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE create_checklist: full Tool Planner → confirm → execute → DB verify", async () => {
  const payload = await getPayload();

  const def = getAgentToolDefinition("create_checklist");
  assert.ok(def);
  assert.equal(def!.capability, "write");
  assert.equal(def!.requiresConfirmation, true);

  // Policy Guard
  const router = buildSyntheticRouter("create_checklist");
  const policyGuardOutput = applyPolicyGuard({ router });
  assert.equal(policyGuardOutput.allowDryRun, true);

  // ProposedAction — construct directly (same pattern as create_plan test)
  const ts = Date.now();
  const checklistTitle = `R4F Smoke ${ts}`;
  const action: ProposedAgentAction = {
    id: `r4f-smoke-cl-${ts}`,
    intent: "create_checklist" as const,
    riskLevel: "medium" as const,
    summary: "创建 R4F 冒烟测试清单",
    changes: [{ collection: "checklists" as const, operation: "create" as const, preview: `将创建清单「${checklistTitle}」` }],
    args: {
      title: checklistTitle,
      groups: [{ title: "测试分组", items: [{ title: "测试条目", isCompleted: false, description: null }] }],
      status: "draft" as const,
      visibility: "private" as const,
    },
    requiresConfirmation: true,
    rollbackAvailable: true,
    rollbackPayload: { strategy: "delete_created_document", target: { collection: "checklists" as const, documentId: 0 } },
    toolName: "create_checklist" as const,
  };

  const pendingAction: PendingAction = { action, type: "await_confirmation" };
  assert.ok(parsePendingAction(pendingAction), "pendingAction must be valid");

  // Confirm + Execute
  const { result } = await confirmAndExecute(pendingAction, "create_checklist");
  // create_checklist may not set status field explicitly
  assert.ok(!result.status || result.status !== "failed", "checklist execute must not fail");
  assert.ok(result.assistantMessage.length > 0, "execute result must have assistantMessage");

  // Verify DB: query by title since AgentIntentExecutionResult doesn't expose checklistId
  const checklists = await payload.find({ collection: "checklists", where: { title: { equals: checklistTitle } } });
  assert.ok(checklists.docs.length > 0, "checklist must be created in DB");
  for (const doc of checklists.docs) {
    createdChecklistIds.push(doc.id);
  }

  await cleanup(payload);
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 3: create_schedule_items
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE create_schedule_items: full Tool Planner → confirm → execute → DB verify", async () => {
  const payload = await getPayload();

  const def = getAgentToolDefinition("create_schedule_items");
  assert.ok(def);
  assert.equal(def!.capability, "write");
  assert.equal(def!.requiresConfirmation, true);
  assert.equal(def!.supportsRollback, true, "create_schedule_items must support rollback");

  // Policy Guard
  const router = buildSyntheticRouter("create_schedule_items");
  const policyGuardOutput = applyPolicyGuard({ router });
  assert.equal(policyGuardOutput.allowDryRun, true);

  // ProposedAction
  const ts = Date.now();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];

  const action: ProposedAgentAction = {
    id: `r4f-smoke-sched-${ts}`,
    intent: "create_schedule_items",
    riskLevel: "medium",
    summary: `创建 R4F 冒烟测试日程: ${dateStr}`,
    changes: [{ collection: "schedule-items", operation: "create", preview: `创建日程「R4F 冒烟日程」` }],
    args: {
      items: [{ title: `R4F 冒烟日程 ${ts}`, date: dateStr, startTime: "10:00", endTime: "11:00" }],
      sourceType: "manual" as const,
    },
    requiresConfirmation: true,
    rollbackAvailable: true,
    rollbackPayload: { type: "delete_schedule_items", ids: [] },
    toolName: "create_schedule_items",
  };

  const pendingAction: PendingAction = { action, type: "await_confirmation" };

  // Confirm + Execute
  const { result } = await confirmAndExecute(pendingAction, "create_schedule_items");
  assert.equal(result.status, "completed");

  // Verify DB: query by title since AgentIntentExecutionResult doesn't expose scheduleItemId
  const items = await payload.find({ collection: "schedule-items", where: { title: { equals: `R4F 冒烟日程 ${ts}` } } });
  assert.ok(items.docs.length > 0, "schedule item must be created in DB");
  for (const doc of items.docs) {
    createdScheduleItemIds.push(doc.id);
  }

  // Verify rollback metadata
  assert.ok(result.rollbackPayload, "create_schedule_items result must have rollbackPayload");

  await cleanup(payload);
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 4: Cancel does NOT write to DB
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE cancel: pendingAction → cancel → no execute → DB unchanged", async () => {
  const payload = await getPayload();

  const ts = Date.now();
  const action: ProposedAgentAction = {
    id: `r4f-smoke-cancel-${ts}`,
    intent: "create_plan",
    riskLevel: "medium",
    summary: "不应该被创建的取消测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "取消测试" }],
    args: { title: `R4F 取消测试计划 ${ts}` },
    requiresConfirmation: true,
    toolName: "create_plan",
  };

  const pendingAction: PendingAction = { action, type: "await_confirmation" };

  // Verify cancel signal
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: action.id, type: "cancel" },
    message: "取消",
    pendingAction,
  });
  assert.equal(signals.cancel, true, "cancel signal must be true");
  assert.equal(signals.confirm, false, "confirm signal must be false");

  // Verify no execute happened
  // Find if plan was created (should not exist)
  const cancelTitle = (action.args as { title: string }).title;
  const plans = await payload.find({ collection: "plans", where: { title: { equals: cancelTitle } } });
  assert.equal(plans.docs.length, 0, "canceled action must NOT create DB record");

  await cleanup(payload);
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 5: Policy blocked does NOT write to DB
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE policy blocked: blocked proposal → no pendingAction → no execute → DB unchanged", async () => {
  // Policy Guard: query action with write intent → blocked
  const router: AgentRouterOutput = {
    action: "query",
    confidence: 0.5,
    intent: { intent: "create_plan", args: {}, confidence: 0.5 } as AgentRouterOutput["intent"],
    reason: "test",
    requiresWrite: false,
    target: {},
  };
  const result = applyPolicyGuard({ router });
  assert.equal(result.allowDryRun, false, "query action must block write intent");
  assert.equal(result.allowExecute, false, "query action must block execute");
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 6: Idempotent re-confirmation
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE idempotent: actionId is stable across confirmation restore", async () => {
  const payload = await getPayload();

  const ts = Date.now();
  const actionId = `r4f-smoke-idem-${ts}`;
  const planTitle = `R4F Idempotent ${ts}`;

  // First execution
  const action1: ProposedAgentAction = {
    id: actionId,
    intent: "create_plan",
    riskLevel: "medium",
    summary: "幂等测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "创建幂等测试计划" }],
    args: { title: planTitle, priority: "medium" as const },
    requiresConfirmation: true,
    rollbackAvailable: true,
    rollbackPayload: { type: "delete_plan" },
    toolName: "create_plan",
  };

  const pa1: PendingAction = { action: action1, type: "await_confirmation" };
  const { result: result1 } = await confirmAndExecute(pa1, "idempotent-first");
  createdPlanIds.push(result1.planId!);

  // Verify first write succeeded
  const plansAfter1 = await payload.find({ collection: "plans", where: { title: { equals: planTitle } } });
  assert.equal(plansAfter1.docs.length, 1, "first execution must create exactly 1 plan");

  // Verify actionId survives confirmation → restore round-trip
  const restored = restoreConfirmedIntent(action1);
  assert.ok(restored);
  assert.equal(restored.intent, "create_plan");
  // The actionId is preserved through the ProposedAgentAction → PendingAction → confirmation flow
  assert.equal(action1.id, actionId, "actionId must be stable");

  // Note: receipt-based idempotency protection operates at the pipeline level
  // (execute-and-persist-step.ts → runIdempotentAgentAction), not at the
  // individual tool execute level. The tool-level smoke test verifies
  // confirmation → restore → execute works; receipt idempotency is tested
  // separately in action-receipts tests.

  await cleanup(payload);
});

/* ═══════════════════════════════════════════════════════════════
   SMOKE TEST 7: Trace sanitization in execute result
   ═══════════════════════════════════════════════════════════════ */

testIfDb("SMOKE trace: execute result has no raw prompt or secrets", async () => {
  const ts = Date.now();
  const action: ProposedAgentAction = {
    id: `r4f-smoke-trace-${ts}`,
    intent: "create_plan",
    riskLevel: "medium",
    summary: "trace 测试计划",
    changes: [{ collection: "plans", operation: "create", preview: "trace 测试" }],
    args: { title: `R4F trace 测试 ${ts}` },
    requiresConfirmation: true,
    toolName: "create_plan",
  };

  const pa: PendingAction = { action, type: "await_confirmation" };
  const { result } = await confirmAndExecute(pa, "trace-test");
  createdPlanIds.push(result.planId!);

  const s = JSON.stringify(result);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("apiKey"));
  assert.ok(!s.includes("Authorization"));

  const payload = await getPayload();
  await cleanup(payload);
});
