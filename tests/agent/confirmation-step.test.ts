import assert from "node:assert/strict";
import { test } from "node:test";

import {
  confirmationMatchesPending,
  parseStructuredConfirmation,
  resolveAwaitConfirmationBranch,
  resolveConfirmationSignals,
} from "../../src/lib/agent/chat-pipeline/confirmation-step";
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
