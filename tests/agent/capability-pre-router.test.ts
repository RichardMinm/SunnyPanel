/**
 * R6-C1-D-B-Fix: Updated for pre-router retirement.
 *
 * Pre-router (estimateRouterAction, buildPreRouterGateInput) has been
 * retired in R6-C1-D-B. These tests now verify the retired behavior:
 * always returns "answer" action, no heuristic intent classification.
 *
 * Original tests verified legacy regex/keyword intent guessing.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPreRouterGateInput, estimateRouterAction } from "../../src/lib/agent/capabilities/pre-router";

test("pre-router retired: all actions return answer", () => {
  assert.equal(estimateRouterAction("删除学习计划"), "answer");
  assert.equal(estimateRouterAction("新建学习计划"), "answer");
  assert.equal(estimateRouterAction("删除今天的日程"), "answer");
  assert.equal(estimateRouterAction("查看本周计划"), "answer");
});

test("pre-router retired: router action is answer", () => {
  const input = buildPreRouterGateInput({ message: "删除学习计划", userContext: { userId: 1 } });
  assert.equal(input.router.action, "answer");
  assert.equal(input.router.requiresWrite, false);
});

test("pre-router retired: capability query returns answer", () => {
  const input = buildPreRouterGateInput({ message: "你能做什么", userContext: { userId: 1 } });
  assert.equal(input.router.action, "answer");
  assert.equal(input.intent.intent, "clarify");
});
