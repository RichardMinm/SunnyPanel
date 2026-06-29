import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  confirmationMatchesPending,
  parseStructuredConfirmation,
  resolveAwaitConfirmationBranch,
  resolveConfirmationSignals,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
} from "../../src/lib/agent/intent/heuristics/replies";
import type { PendingAction, ProposedAgentAction } from "../../src/lib/agent/schemas";

const makePending = (id: string): Extract<PendingAction, { type: "await_confirmation" }> => ({
  action: {
    args: {},
    changes: [],
    id,
    intent: "create_plan",
    riskLevel: "medium",
    summary: "test",
  } as ProposedAgentAction,
  type: "await_confirmation",
});

describe("Confirmation reply heuristics", () => {
  test("exact match confirmation phrases work", () => {
    assert.equal(isConfirmationReply("确认"), true);
    assert.equal(isConfirmationReply("执行"), true);
    assert.equal(isConfirmationReply("好的"), true);
    assert.equal(isConfirmationReply("好"), true);
    assert.equal(isConfirmationReply("继续"), true);
    assert.equal(isConfirmationReply("同意"), true);
  });

  test("natural language confirmation is recognized via includes", () => {
    assert.equal(isConfirmationReply("好，执行吧"), true);
    assert.equal(isConfirmationReply("可以，确认执行"), true);
    assert.equal(isConfirmationReply("嗯好的，没问题"), true);
    assert.equal(isConfirmationReply("那就继续执行吧"), true);
  });

  test("cancellation phrases are not recognized as confirmation", () => {
    assert.equal(isConfirmationReply("取消"), false);
    assert.equal(isConfirmationReply("不用了"), false);
    assert.equal(isConfirmationReply("先不用"), false);
    assert.equal(isConfirmationReply("不要执行"), false);
  });

  test("ambiguous input with both confirm and cancel leans cancel", () => {
    assert.equal(isConfirmationReply("不用了，取消吧"), false);
    assert.equal(isConfirmationReply("先不用执行"), false);
  });

  test("isCancellationReply recognizes cancel phrases", () => {
    assert.equal(isCancellationReply("取消"), true);
    assert.equal(isCancellationReply("不要执行"), true);
    assert.equal(isCancellationReply("放弃"), true);
    assert.equal(isCancellationReply("先别执行"), true);
  });

  test("isNegativeReply recognizes negative phrases", () => {
    assert.equal(isNegativeReply("不用了"), true);
    assert.equal(isNegativeReply("先不用"), true);
    assert.equal(isNegativeReply("暂时不用"), true);
    assert.equal(isNegativeReply("不需要"), true);
  });

  test("batch confirmation only accepts exact phrases", () => {
    assert.equal(isBatchConfirmationReply("确认"), true);
    assert.equal(isBatchConfirmationReply("好的"), true);
    assert.equal(isBatchConfirmationReply("好的，再加一条"), false);
    assert.equal(isBatchConfirmationReply("好，执行吧"), false);
  });

  test("unrelated messages are not confirmation", () => {
    assert.equal(isConfirmationReply("帮我制定一个学习计划"), false);
    assert.equal(isConfirmationReply("今天天气怎么样"), false);
  });
});

describe("Confirmation pipeline step", () => {
  test("parseStructuredConfirmation reads confirm payload", () => {
    const parsed = parseStructuredConfirmation({
      confirmation: {
        actionId: "act-1",
        type: "confirm",
      },
    });

    assert.deepEqual(parsed, {
      actionId: "act-1",
      type: "confirm",
    });
  });

  test("parseStructuredConfirmation reads cancel payload", () => {
    const parsed = parseStructuredConfirmation({
      confirmation: {
        actionId: "act-1",
        type: "cancel",
      },
    });

    assert.deepEqual(parsed, {
      actionId: "act-1",
      type: "cancel",
    });
  });

  test("parseStructuredConfirmation returns null when confirmation block invalid", () => {
    assert.equal(parseStructuredConfirmation({ confirmation: "nope" }), null);
    assert.equal(parseStructuredConfirmation({ confirmation: { type: "confirm" } }), null);
    assert.equal(parseStructuredConfirmation({ confirmation: { actionId: "", type: "confirm" } }), null);
  });

  test("resolveConfirmationSignals honors structured confirm", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: {
        actionId: "act-1",
        type: "confirm",
      },
      message: "随便说点别的",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, true);
    assert.equal(signals.cancel, false);
  });

  test("structured confirm with wrong actionId falls back to text confirmation", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: {
        actionId: "wrong",
        type: "confirm",
      },
      message: "确认",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, true);
    assert.equal(signals.cancel, false);
  });

  test("structured confirm with wrong actionId and no text confirm yields false", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: {
        actionId: "wrong",
        type: "confirm",
      },
      message: "我再想一下",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, false);
    assert.equal(signals.cancel, false);
  });

  test("Manual Test 4: unrelated reply while awaiting keeps neither confirm nor cancel", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: null,
      message: "我再想一下",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, false);
    assert.equal(signals.cancel, false);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "still_waiting");
  });

  test("Manual Test 5: cancel clears — natural language 取消", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: null,
      message: "取消",
      pendingAction: pending,
    });

    assert.equal(signals.cancel, true);
    assert.equal(signals.confirm, false);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "cancel");
  });

  test("Manual Test 5b: structured cancel with matching actionId", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: { actionId: "act-1", type: "cancel" },
      message: "",
      pendingAction: pending,
    });

    assert.equal(signals.cancel, true);
    assert.equal(signals.confirm, false);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "cancel");
  });

  test("state machine: high risk pending ignores natural language confirm", () => {
    const pending: Extract<PendingAction, { type: "await_confirmation" }> = {
      action: {
        args: { entityName: "测试", entityType: "plan" },
        changes: [{ collection: "plans", operation: "delete", preview: "删除" }],
        id: "del-1",
        intent: "delete_record",
        riskLevel: "high",
        summary: "删除计划",
      } as ProposedAgentAction,
      type: "await_confirmation",
    };
    const signals = resolveConfirmationSignals({
      confirmation: null,
      message: "确认",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, false);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "still_waiting");
  });

  test("state machine: structured confirm works for high risk delete", () => {
    const pending: Extract<PendingAction, { type: "await_confirmation" }> = {
      action: {
        args: { entityName: "测试", entityType: "plan" },
        changes: [{ collection: "plans", operation: "delete", preview: "删除" }],
        id: "del-1",
        intent: "delete_record",
        riskLevel: "high",
        summary: "删除计划",
      } as ProposedAgentAction,
      type: "await_confirmation",
    };
    const signals = resolveConfirmationSignals({
      confirmation: { actionId: "del-1", type: "confirm" },
      message: "",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, true);
  });

  test("state machine: explicit 确认 yields confirmed branch", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: null,
      message: "确认",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, true);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "confirmed");
  });

  test("state machine: structured confirm wrong id but message 执行 yields confirmed", () => {
    const pending = makePending("act-1");
    const signals = resolveConfirmationSignals({
      confirmation: { actionId: "other", type: "confirm" },
      message: "执行",
      pendingAction: pending,
    });

    assert.equal(signals.confirm, true);
    assert.equal(resolveAwaitConfirmationBranch(pending, signals), "confirmed");
  });

  test("state machine: no pending await_confirmation yields idle signals", () => {
    const signals = resolveConfirmationSignals({
      confirmation: null,
      message: "取消",
      pendingAction: null,
    });

    assert.equal(signals.cancel, false);
    assert.equal(signals.confirm, false);
  });

  test("confirmationMatchesPending compares ids", () => {
    const pending = makePending("x");

    assert.equal(
      confirmationMatchesPending(pending, {
        actionId: "x",
        type: "cancel",
      }),
      true,
    );
  });
});
