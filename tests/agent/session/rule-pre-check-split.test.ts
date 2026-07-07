/**
 * Phase R6-C0-B: rule-pre-check split verification.
 *
 * Verifies:
 *  1. Safety functions importable from confirmation-pre-check
 *  2. Business functions importable from business-rule-pre-check
 *  3. Facade still exports everything
 *  4. Confirm/cancel behavior unchanged
 *  5. Business rules still work
 */

import assert from "node:assert/strict";
import { test } from "node:test";

test("confirmation-pre-check exports safety functions", async () => {
  const mod = await import("../../../src/lib/agent/session/confirmation-pre-check");
  assert.ok(typeof mod.isPendingConfirmMessage === "function");
  assert.ok(typeof mod.isPendingCancelMessage === "function");
  assert.ok(typeof mod.resolveConfirmationPreCheck === "function");
});

test("business-rule-pre-check exports business functions", async () => {
  const mod = await import("../../../src/lib/agent/session/business-rule-pre-check");
  assert.ok(typeof mod.isDeepenMessage === "function");
  assert.ok(typeof mod.isScheduleQueryMessage === "function");
  assert.ok(typeof mod.isScheduleCreateMessage === "function");
  assert.ok(typeof mod.isWritingRevisionMessage === "function");
  assert.ok(typeof mod.resolveBusinessRulePreCheck === "function");
});

test("rule-pre-check facade still exports everything", async () => {
  const mod = await import("../../../src/lib/agent/session/rule-pre-check");
  assert.ok(typeof mod.isPendingConfirmMessage === "function");
  assert.ok(typeof mod.isPendingCancelMessage === "function");
  assert.ok(typeof mod.isDeepenMessage === "function");
  assert.ok(typeof mod.rulePreCheck === "function");
  assert.ok(typeof mod.resolveConfirmationPreCheck === "function");
  assert.ok(typeof mod.resolveBusinessRulePreCheck === "function");
});

test("confirm pendingAction behavior unchanged", async () => {
  const { resolveConfirmationPreCheck } = await import(
    "../../../src/lib/agent/session/confirmation-pre-check"
  );
  const result = resolveConfirmationPreCheck({
    pendingAction: {
      type: "await_confirmation",
      action: { intent: "create_plan" },
      summary: "创建测试计划",
    },
    message: "确认",
  });
  assert.ok(result);
  assert.equal(result!.transitionType, "confirm_pending_action");
});

test("cancel pendingAction behavior unchanged", async () => {
  const { resolveConfirmationPreCheck } = await import(
    "../../../src/lib/agent/session/confirmation-pre-check"
  );
  const result = resolveConfirmationPreCheck({
    pendingAction: {
      type: "await_confirmation",
      action: { intent: "create_plan" },
      summary: "创建测试计划",
    },
    message: "取消",
  });
  assert.ok(result);
  assert.equal(result!.transitionType, "cancel_pending_action");
});

test("no pendingAction → confirmation pre-check returns null", async () => {
  const { resolveConfirmationPreCheck } = await import(
    "../../../src/lib/agent/session/confirmation-pre-check"
  );
  const result = resolveConfirmationPreCheck({
    pendingAction: null,
    message: "确认",
  });
  assert.equal(result, null);
});

test("business rule pre-check returns result for schedule query", async () => {
  const { resolveBusinessRulePreCheck } = await import(
    "../../../src/lib/agent/session/business-rule-pre-check"
  );
  const session = { semantic: {}, conversation: {} } as never;
  const result = resolveBusinessRulePreCheck({
    session,
    message: "查看本周日程",
  });
  assert.ok(result);
  assert.equal(result!.transitionType, "switch_domain");
});

test("facade rulePreCheck still works for confirmation", async () => {
  const { rulePreCheck } = await import("../../../src/lib/agent/session/rule-pre-check");
  const session = { semantic: {}, conversation: {} } as never;
  const result = rulePreCheck({
    session,
    message: "确认",
    pendingAction: {
      type: "await_confirmation",
      action: { intent: "create_plan" },
      summary: "测试",
    },
  });
  assert.ok(result);
  assert.equal(result!.transitionType, "confirm_pending_action");
});
