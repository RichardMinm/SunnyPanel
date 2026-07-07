import assert from "node:assert/strict";
import { test } from "node:test";

import { getAllowedCapabilities } from "../../src/lib/agent/capabilities/tool-gate";
import { buildPreRouterGateInput } from "../../src/lib/agent/capabilities/pre-router";
import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import type { AgentIntent } from "../../src/lib/agent/schemas";

const gateFor = (intent: AgentIntent, action?: ReturnType<typeof normalizeRouterOutput>["action"]) => {
  const router = normalizeRouterOutput({ intent });

  return getAllowedCapabilities({
    intent,
    router: action ? { ...router, action, requiresWrite: action !== "query" && action !== "answer" } : router,
    userContext: { userId: 1 },
  });
};

test("query action exposes search only", () => {
  const intent: AgentIntent = {
    args: { planTitle: "测试" },
    intent: "query_plan_progress",
  };
  const gate = gateFor(intent, "query");

  assert.ok(gate.exposableToLLM.every((name) => name.startsWith("search_")));
  assert.ok(!gate.exposableToLLM.some((name) => name.startsWith("preview_")));
  assert.ok(!gate.exposableToLLM.some((name) => name.startsWith("draft_")));
});

test("create action allows search draft and preview_create", () => {
  const intent: AgentIntent = {
    args: { title: "新计划" },
    intent: "create_plan",
  };
  const gate = gateFor(intent, "create");

  assert.ok(gate.allowed.includes("search_plans"));
  assert.ok(gate.allowed.includes("draft_plan"));
  assert.ok(gate.allowed.includes("preview_create_plan"));
  assert.ok(!gate.allowed.includes("execute_create_plan"));
});

test("delete action allows preview_delete but not execute", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划A", entityType: "plan" },
    intent: "delete_record",
  };
  const gate = gateFor(intent, "delete");

  assert.ok(gate.allowed.includes("preview_delete_plan"));
  assert.ok(!gate.allowed.includes("execute_delete_plan"));
});

test("not_found resolver status blocks preview capabilities", () => {
  const intent: AgentIntent = {
    args: { entityName: "不存在", entityType: "plan" },
    intent: "delete_record",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    resolverStatus: "not_found",
    router,
    userContext: { userId: 1 },
  });

  assert.ok(!gate.allowed.includes("preview_delete_plan"));
  assert.ok(gate.blocked.some((item) => item.name === "preview_delete_plan"));
});

test("denied legacy intent blocks mapped capabilities", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划A", entityType: "plan" },
    intent: "delete_record",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: {
      preferences: {
        autoApproveIntents: new Set(),
        autoApproveLowRisk: false,
        autonomyLevel: 0,
        deniedIntents: new Set(["delete_record"]),
        maxConsecutiveAutoApprovals: 0,
      },
      userId: 1,
    },
  });

  assert.ok(!gate.allowed.includes("preview_delete_plan"));
  assert.ok(gate.blocked.some((item) => item.name === "preview_delete_plan"));
});

test("pre-router retired: delete message returns answer action", () => {
  // R6-C1-D-B: pre-router retired — returns answer, not delete.
  // Capability routing now goes through Tool Planner controlled path.
  const input = buildPreRouterGateInput({
    message: "删除学习计划",
    userContext: { userId: 1 },
  });
  assert.equal(input.router.action, "answer");
  assert.equal(input.router.requiresWrite, false);
});

test("create action with schedule target only allows schedule capabilities", () => {
  const intent: AgentIntent = {
    args: { date: "2026-07-01", title: "日程" },
    intent: "compose_schedule_item",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  // schedule capabilities should be allowed
  assert.ok(gate.allowed.includes("search_schedules"));
  assert.ok(gate.allowed.includes("preview_create_schedule"));

  // plan capabilities should NOT be allowed (wrong target)
  assert.ok(!gate.allowed.includes("preview_create_plan"));
  assert.ok(!gate.allowed.includes("draft_plan"));

  // writing capabilities should NOT be allowed (wrong target)
  assert.ok(!gate.allowed.includes("draft_writing_outline"));
});

test("create action with timeline target only allows timeline capabilities", () => {
  const intent: AgentIntent = {
    args: { itemTitle: "事件" },
    intent: "compose_timeline_event",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  assert.ok(gate.allowed.includes("search_timeline"));
  assert.ok(gate.allowed.includes("preview_create_timeline"));
  assert.ok(!gate.allowed.includes("preview_create_plan"));
  assert.ok(!gate.allowed.includes("preview_create_schedule"));
});

test("create action with plan target still allows plan capabilities (regression)", () => {
  const intent: AgentIntent = {
    args: { title: "新计划" },
    intent: "create_plan",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  assert.ok(gate.allowed.includes("search_plans"));
  assert.ok(gate.allowed.includes("draft_plan"));
  assert.ok(gate.allowed.includes("preview_create_plan"));
});

test("answer action skips target check (no entityType in target)", () => {
  const intent: AgentIntent = {
    args: { answer: "你好", topic: "聊天" },
    intent: "explain_concept",
  };
  const router = normalizeRouterOutput({ intent });
  const gate = getAllowedCapabilities({
    intent,
    router,
    userContext: { userId: 1 },
  });

  // answer action should still have search capabilities
  assert.ok(gate.allowed.includes("search_plans"));
  assert.ok(gate.allowed.includes("search_schedules"));
});
