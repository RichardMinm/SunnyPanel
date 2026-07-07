/**
 * Phase R6-C0-C: intent resolution split verification.
 *
 * Verifies:
 *  1. Confirmation path is importable
 *  2. Legacy heuristic path is importable
 *  3. Old facade exports unchanged
 *  4. Confirm/cancel behavior unchanged
 *  5. Existing pendingAction confirmation works
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveConfirmationSignals,
  confirmationMatchesPending,
  restoreConfirmedIntent,
} from "../../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parseProposedAgentAction,
  type PendingAction,
} from "../../../src/lib/agent/schemas";

/* ──── 1. Confirmation path importable ──── */

test("confirmation-step functions are importable", () => {
  assert.ok(typeof confirmationMatchesPending === "function");
  assert.ok(typeof resolveConfirmationSignals === "function");
  assert.ok(typeof restoreConfirmedIntent === "function");
});

/* ──── 2. Legacy heuristic path importable ──── */

test("resolveAgentIntent is still importable", async () => {
  const mod = await import("../../../src/lib/agent/intent-resolution");
  assert.ok(typeof mod.resolveAgentIntent === "function");
});

test("resolve-intent-step is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/resolve-intent-step");
  assert.ok(typeof mod.runResolveIntentStep === "function");
});

/* ──── 3. Confirm behavior unchanged ──── */

test("existing pendingAction + confirm → confirm signal true", () => {
  const action = parseProposedAgentAction({
    id: "r6c0c-test-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建计划",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "R6-C0-C 测试" },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "r6c0c-test-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
});

/* ──── 4. Cancel behavior unchanged ──── */

test("existing pendingAction + cancel → cancel signal true", () => {
  const action = parseProposedAgentAction({
    id: "r6c0c-test-002",
    intent: "create_schedule_items",
    riskLevel: "medium",
    summary: "创建日程",
    changes: [{ collection: "schedule-items", operation: "create", preview: "测试" }],
    args: { items: [{ title: "R6-C0-C", date: "2026-07-10" }] },
  })!;

  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "r6c0c-test-002", type: "cancel" },
    message: "取消",
    pendingAction: pa,
  });
  assert.equal(signals.cancel, true);
});

/* ──── 5. Ambiguous behavior unchanged ──── */

test("existing pendingAction + ambiguous → neither confirm nor cancel", () => {
  const action = parseProposedAgentAction({
    id: "r6c0c-test-003",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建计划",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "测试" },
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

/* ──── 6. No pendingAction → confirm false ──── */

test("no pendingAction + require mode → no confirmation signals", () => {
  const signals = resolveConfirmationSignals({
    confirmation: null,
    message: "确认",
    pendingAction: null,
  });
  assert.equal(signals.confirm, false);
  assert.equal(signals.cancel, false);
});

/* ──── 7. confirmationMatchesPending still works ──── */

test("confirmationMatchesPending matches by actionId", () => {
  const action = parseProposedAgentAction({
    id: "r6c0c-match-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "匹配测试",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "测试" },
  })!;
  const pa = { action, type: "await_confirmation" } as Extract<PendingAction, { type: "await_confirmation" }>;
  assert.equal(confirmationMatchesPending(pa, { actionId: "r6c0c-match-001", type: "confirm" }), true);
  assert.equal(confirmationMatchesPending(pa, { actionId: "wrong", type: "confirm" }), false);
});
