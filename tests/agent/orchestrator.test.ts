import assert from "node:assert/strict";
import { test } from "node:test";

import { groupTasksByAgent, routeTaskToAgent } from "../../src/lib/agent/agents/router";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";

const sampleTask = (overrides: Partial<TaskNode>): TaskNode => ({
  agentRole: "plan",
  args: { title: "测试计划" },
  dependsOn: [],
  id: "t1",
  intent: "compose_plan",
  label: "制定计划",
  ...overrides,
});

test("routeTaskToAgent maps plan role", () => {
  assert.equal(routeTaskToAgent(sampleTask({})), "plan");
  assert.equal(routeTaskToAgent(sampleTask({ agentRole: "schedule", intent: "compose_schedule_item" })), "schedule");
});

test("groupTasksByAgent buckets tasks", () => {
  const groups = groupTasksByAgent([
    sampleTask({ id: "t1" }),
    sampleTask({ id: "t2", agentRole: "schedule", intent: "compose_schedule_item", label: "排期" }),
  ]);

  assert.equal(groups.get("plan")?.length, 1);
  assert.equal(groups.get("schedule")?.length, 1);
});
