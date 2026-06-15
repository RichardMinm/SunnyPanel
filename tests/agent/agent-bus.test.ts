import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAgentBus,
  formatUpstreamContext,
  mergeTaskArgsWithBus,
  publishTaskArtifact,
  publishTaskIntent,
  publishTaskNote,
  resolveUpstreamTaskIds,
} from "../../src/lib/agent/agents/bus";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";

const task = (id: string, dependsOn: string[] = [], overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "plan",
  args: {},
  dependsOn,
  id,
  intent: "compose_plan",
  label: id,
  ...overrides,
});

test("resolveUpstreamTaskIds computes the transitive dependency closure", () => {
  const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t2"])];
  const closure = resolveUpstreamTaskIds(tasks[2], tasks);

  assert.deepEqual([...closure].sort(), ["t1", "t2"]);
});

test("resolveUpstreamTaskIds falls back to direct dependencies without the task list", () => {
  const closure = resolveUpstreamTaskIds(task("t3", ["t2"]));

  assert.deepEqual([...closure], ["t2"]);
});

test("mergeTaskArgsWithBus propagates ids across the transitive closure", () => {
  const tasks = [
    task("t1", [], { agentRole: "plan" }),
    task("t2", ["t1"], { agentRole: "schedule", intent: "schedule_plan" }),
    task("t3", ["t2"], { agentRole: "content", intent: "compose_timeline_event" }),
  ];
  let bus = createAgentBus();
  bus = publishTaskArtifact(bus, { from: "plan", payload: { planId: 42, planTitle: "高数二轮" }, taskId: "t1" });

  // t3 只直接依赖 t2，但闭包应让它拿到 t1 产出的 planId。
  const merged = mergeTaskArgsWithBus(tasks[2], bus, tasks);

  assert.equal((merged.args as { planId?: number }).planId, 42);
});

test("formatUpstreamContext surfaces artifacts, notes and intents with reasoning", () => {
  const tasks = [task("t1"), task("t2", ["t1"])];
  let bus = createAgentBus();
  bus = publishTaskArtifact(bus, {
    from: "plan",
    payload: { planId: 7, planTitle: "信息安全学习" },
    reasoning: "已创建计划草稿",
    taskId: "t1",
  });
  bus = publishTaskNote(bus, { from: "plan", note: "计划偏蓝队方向", taskId: "t1" });
  bus = publishTaskIntent(bus, { from: "plan", intent: "compose_plan", reasoning: "保持咨询不写库", taskId: "t1" });

  const context = formatUpstreamContext(tasks[1], bus, tasks);

  assert.match(context, /planId=7/);
  assert.match(context, /已创建计划草稿/);
  assert.match(context, /计划偏蓝队方向/);
  assert.match(context, /意图（t1）：compose_plan/);
});

test("formatUpstreamContext ignores tasks outside the dependency closure", () => {
  const tasks = [task("t1"), task("t2"), task("t3", ["t1"])];
  let bus = createAgentBus();
  bus = publishTaskArtifact(bus, { from: "schedule", payload: { planId: 99 }, taskId: "t2" });

  const context = formatUpstreamContext(tasks[2], bus, tasks);

  assert.equal(context, "");
});
