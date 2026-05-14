import assert from "node:assert/strict";
import { test } from "node:test";

import { isConfirmationReply, isCancellationReply, isNegativeReply } from "../../src/lib/agent/intent/heuristics/replies";

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

test("unrelated messages are not confirmation", () => {
  assert.equal(isConfirmationReply("帮我制定一个学习计划"), false);
  assert.equal(isConfirmationReply("今天天气怎么样"), false);
});
