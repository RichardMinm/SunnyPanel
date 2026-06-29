import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPreRouterGateInput, estimateRouterAction } from "../../src/lib/agent/capabilities/pre-router";
import { getAllowedCapabilities } from "../../src/lib/agent/capabilities/tool-gate";

test("delete message estimates delete action", () => {
  assert.equal(estimateRouterAction("删除学习计划"), "delete");
});

test("delete message pre-router exposes preview_delete not execute", () => {
  const gate = getAllowedCapabilities(
    buildPreRouterGateInput({
      message: "删除学习计划",
      userContext: { userId: 1 },
    }),
  );

  assert.ok(gate.exposableToLLM.includes("preview_delete_plan"));
  assert.ok(gate.exposableToLLM.includes("search_plans"));
  assert.ok(!gate.exposableToLLM.some((name) => name.startsWith("execute_")));
});

test("create plan message exposes draft and preview_create", () => {
  const gate = getAllowedCapabilities(
    buildPreRouterGateInput({
      message: "新建学习计划",
      userContext: { userId: 1 },
    }),
  );

  assert.ok(gate.exposableToLLM.includes("draft_plan"));
  assert.ok(gate.exposableToLLM.includes("preview_create_plan"));
  assert.ok(!gate.exposableToLLM.includes("execute_create_plan"));
});

test("pre-router gate input carries synthetic router action", () => {
  const input = buildPreRouterGateInput({
    message: "删除今天的日程",
    userContext: { userId: 1 },
  });

  assert.equal(input.router.action, "delete");
  assert.equal(input.intent.intent, "delete_record");
});
