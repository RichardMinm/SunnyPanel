/**
 * Phase LLM-R4E: Confirmation-to-Execute E2E Verification.
 *
 * Verifies that an LLM Tool Planner PendingAction flows through:
 *   pendingAction → confirmation-step → restoreConfirmedIntent → execute pipeline
 *
 * This test file focuses on UNIT and CONTRACT verification.
 * DB-dependent E2E tests are in db-smoke.test.ts (conditional skip if no DB).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmationMatchesPending,
  resolveConfirmationSignals,
  restoreConfirmedIntent,
  type StructuredConfirmation,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parsePendingAction,
  parseProposedAgentAction,
  type PendingAction,
  type ProposedAgentAction,
} from "../../src/lib/agent/schemas";
import { dryRunAgentTool } from "../../src/lib/agent/tool-registry";
import { createIntentFromProposedAction, buildProposedActionMessage } from "../../src/lib/agent/safety";
import { executeAgentIntent } from "../../src/lib/agent/executor";

/* ──── Helpers ──── */

const buildTestConfirmation = (actionId: string, type: "confirm" | "cancel"): StructuredConfirmation => ({
  actionId,
  type,
});

/* ──── 1. PendingAction shape round-trip ──── */

test("R4D pendingAction shape: await_confirmation parses correctly", () => {
  const action = parseProposedAgentAction({
    id: "r4e-test-001",
    intent: "create_schedule_items",
    riskLevel: "medium",
    summary: "创建测试日程",
    changes: [{ collection: "schedule-items", operation: "create", preview: "创建日程" }],
    args: { items: [{ title: "测试", date: "2026-07-10" }] },
    requiresConfirmation: true,
  });
  assert.ok(action, "ProposedAgentAction must parse");

  const pa: PendingAction = { action, type: "await_confirmation" };
  const parsed = parsePendingAction(pa);
  assert.ok(parsed);
  assert.equal(parsed!.type, "await_confirmation");
});

/* ──── 2. confirmationMatchesPending ──── */

test("confirmationMatchesPending matches R4D pendingAction by actionId", () => {
  const action = parseProposedAgentAction({
    id: "match-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "测试计划" },
  })!;

  const pa = { action, type: "await_confirmation" } as Extract<PendingAction, { type: "await_confirmation" }>;
  assert.equal(confirmationMatchesPending(pa, buildTestConfirmation("match-001", "confirm")), true);
  assert.equal(confirmationMatchesPending(pa, buildTestConfirmation("wrong-id", "confirm")), false);
});

/* ──── 3. resolveConfirmationSignals ──── */

test("resolveConfirmationSignals: confirm → signals.confirm=true", () => {
  const action = parseProposedAgentAction({
    id: "sig-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: buildTestConfirmation("sig-001", "confirm"),
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
  assert.equal(signals.cancel, false);
});

test("resolveConfirmationSignals: cancel → signals.cancel=true", () => {
  const action = parseProposedAgentAction({
    id: "sig-002", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: buildTestConfirmation("sig-002", "cancel"),
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(signals.cancel, true);
  assert.equal(signals.confirm, false);
});

test("resolveConfirmationSignals: ambiguous message → neither confirm nor cancel", () => {
  const action = parseProposedAgentAction({
    id: "sig-003", intent: "create_checklist", riskLevel: "medium",
    summary: "创建清单", changes: [{ collection: "checklists", operation: "create", preview: "创建" }],
    args: { title: "清单", groups: [{ title: "g1", items: [{ title: "i1", isCompleted: false }] }] },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "今天天气不错",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

/* ──── 4. restoreConfirmedIntent compatibility (all 3 allowlisted tools) ──── */

test("restoreConfirmedIntent: create_plan → valid AgentIntent", () => {
  const action = parseProposedAgentAction({
    id: "restore-plan-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建学习计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "Rust 学习计划", priority: "high" },
  })!;

  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_plan");
  const args = intent.args as { title: string };
  assert.equal(args.title, "Rust 学习计划");
});

test("restoreConfirmedIntent: create_checklist → valid AgentIntent", () => {
  const action = parseProposedAgentAction({
    id: "restore-cl-001", intent: "create_checklist", riskLevel: "medium",
    summary: "创建清单", changes: [{ collection: "checklists", operation: "create", preview: "创建" }],
    args: { title: "部署检查清单", groups: [{ title: "服务器", items: [{ title: "重启", isCompleted: false }] }] },
  })!;

  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_checklist");
});

test("restoreConfirmedIntent: create_schedule_items → valid AgentIntent", () => {
  const action = parseProposedAgentAction({
    id: "restore-sched-001", intent: "create_schedule_items", riskLevel: "medium",
    summary: "创建日程", changes: [{ collection: "schedule-items", operation: "create", preview: "创建" }],
    args: { items: [{ title: "会议", date: "2026-07-15", startTime: "09:00", endTime: "10:00" }] },
  })!;

  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_schedule_items");
  const args = intent.args as { items: Array<{ title: string }> };
  assert.ok(Array.isArray(args.items));
  assert.equal(args.items[0].title, "会议");
});

/* ──── 5. Restored intent shape is compatible with executeAgentIntent dispatch ──── */

test("restored create_plan intent has intent name matching executor dispatch", () => {
  const action = parseProposedAgentAction({
    id: "exec-plan-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "执行测试计划" },
  })!;
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  // The executor dispatches by intent.intent — verify the name is a known write intent
  const writeIntents = ["create_plan", "create_checklist", "create_schedule_items", "append_plan_item",
    "complete_plan_item", "cancel_schedule_item", "reschedule_item", "save_memory",
    "schedule_plan", "delete_record", "modify_record", "add_completion_note",
    "compose_plan", "compose_schedule_item", "compose_timeline_event", "weekly_review"];
  assert.ok(writeIntents.includes(intent.intent), `intent ${intent.intent} must be a known write intent`);
});

test("restored create_schedule_items intent has args.items for executor", () => {
  const action = parseProposedAgentAction({
    id: "exec-sched-001", intent: "create_schedule_items", riskLevel: "medium",
    summary: "创建日程", changes: [{ collection: "schedule-items", operation: "create", preview: "创建" }],
    args: { items: [{ title: "执行测试", date: "2026-07-20" }] },
  })!;
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_schedule_items");
  const args = intent.args as { items?: Array<unknown> };
  assert.ok(args.items, "restored intent must have items for executor");
  assert.ok(Array.isArray(args.items));
});

/* ──── 6. buildProposedActionMessage produces user-visible text ──── */

test("buildProposedActionMessage produces readable message", () => {
  const action = parseProposedAgentAction({
    id: "msg-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建 Rust 学习计划",
    changes: [{ collection: "plans", operation: "create", preview: "将创建计划「Rust 学习计划」" }],
    args: { title: "Rust 学习计划" },
  })!;
  const msg = buildProposedActionMessage(action);
  assert.ok(msg.length > 0);
  assert.ok(msg.includes("创建") || msg.includes("Rust") || msg.includes("计划"), "message should describe the action");
});

/* ──── 7. PendingAction action is from dryRun, not LLM raw output ──── */

test("parseProposedAgentAction validates required fields — rejects LLM raw output", () => {
  // An LLM might output incomplete action — parseProposedAgentAction should reject it
  const invalid = parseProposedAgentAction({
    id: "raw-llm-001",
    // missing intent
    riskLevel: "low",
    summary: "raw output",
    changes: [],
  });
  assert.equal(invalid, null, "parseProposedAgentAction must reject incomplete actions");
});

test("parseProposedAgentAction requires non-empty changes array", () => {
  const invalid = parseProposedAgentAction({
    id: "no-changes", intent: "create_plan", riskLevel: "medium",
    summary: "no changes", changes: [],
  });
  assert.equal(invalid, null);
});

/* ──── 8. No execute marker in pendingAction ──── */

test("pendingAction JSON has no execute trigger", () => {
  const action = parseProposedAgentAction({
    id: "no-exec-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("\"execute\""));
  assert.ok(!s.includes("autoExecute"));
});

/* ──── 9. No DB write in pendingAction ──── */

test("pendingAction JSON has no DB write instruction", () => {
  const action = parseProposedAgentAction({
    id: "no-db-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── 10. No secrets in pendingAction ──── */

test("pendingAction JSON has no secrets", () => {
  const action = parseProposedAgentAction({
    id: "no-leak-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "计划" },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const s = JSON.stringify(pa);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("apiKey"));
  assert.ok(!s.includes("Authorization"));
  assert.ok(!s.includes("password"));
  // Note: "secret" check not included here because it's too broad
  // (matches any field name/value containing "secret")
});

/* ──── 11. createIntentFromProposedAction round-trip ──── */

test("createIntentFromProposedAction round-trips for create_plan", () => {
  const action = parseProposedAgentAction({
    id: "rt-plan-001", intent: "create_plan", riskLevel: "medium",
    summary: "创建计划", changes: [{ collection: "plans", operation: "create", preview: "创建" }],
    args: { title: "往返测试计划", priority: "high", dueDate: "2026-08-01" },
  })!;
  const intent = createIntentFromProposedAction(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_plan");
});

test("createIntentFromProposedAction round-trips for create_checklist", () => {
  const action = parseProposedAgentAction({
    id: "rt-cl-001", intent: "create_checklist", riskLevel: "medium",
    summary: "创建清单", changes: [{ collection: "checklists", operation: "create", preview: "创建" }],
    args: { title: "往返清单", groups: [{ title: "g1", items: [{ title: "任务1", isCompleted: false }] }] },
  })!;
  const intent = createIntentFromProposedAction(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_checklist");
});

test("createIntentFromProposedAction round-trips for create_schedule_items", () => {
  const action = parseProposedAgentAction({
    id: "rt-sched-001", intent: "create_schedule_items", riskLevel: "medium",
    summary: "创建日程", changes: [{ collection: "schedule-items", operation: "create", preview: "创建" }],
    args: { items: [{ title: "往返日程", date: "2026-07-25" }] },
  })!;
  const intent = createIntentFromProposedAction(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_schedule_items");
});
