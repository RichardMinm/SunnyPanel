import assert from "node:assert/strict";
import { test } from "node:test";

import { buildToolFailureRepairPlan } from "../../src/lib/agent/orchestration/tool-failure-repair";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";

const completeTask = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "plan",
  args: {
    checklistTitle: "线性代数复习",
    completionNote: "已完成基础题",
    groupTitle: "第一阶段",
    itemTitle: "矩阵习题",
  },
  dependsOn: [],
  id: "task-complete-item",
  intent: "complete_plan_item",
  label: "完成矩阵习题",
  ...overrides,
});

test("buildToolFailureRepairPlan turns missing checklist item failures into a safe append proposal", () => {
  const repair = buildToolFailureRepairPlan({
    failureCode: "checklist_item_not_found",
    failedTask: completeTask(),
    failureReason: "任意安全文案",
    message: "我已经完成矩阵习题",
  });

  assert.ok(repair);
  assert.equal(repair.plan.mode, "compound");
  assert.match(repair.plan.reasoning, /语义修复/);
  assert.equal(repair.plan.tasks.length, 2);
  assert.equal(repair.plan.tasks[0]?.intent, "answer_question");
  assert.equal(repair.plan.tasks[1]?.intent, "append_plan_item");
  assert.equal(repair.plan.tasks[1]?.dependsOn[0], repair.plan.tasks[0]?.id);
  assert.deepEqual(repair.plan.tasks[1]?.args, {
    checklistTitle: "线性代数复习",
    createGroupIfMissing: true,
    description: "语义修复：原本要标记「矩阵习题」完成，但当前清单里还没有这条条目；先补建为未完成条目，确认后可继续标记完成。",
    groupTitle: "第一阶段",
    itemTitle: "矩阵习题",
  });
  assert.match(repair.summary, /矩阵习题/);
});

test("buildToolFailureRepairPlan ignores unrelated tool failures", () => {
  const repair = buildToolFailureRepairPlan({
    failedTask: completeTask({
      intent: "create_plan",
      args: {
        title: "线性代数复盘",
      },
    }),
    failureReason: "resolver offline",
    message: "创建一个复盘计划",
  });

  assert.equal(repair, null);
});

test("buildToolFailureRepairPlan does not infer repair authority from matching text", () => {
  const repair = buildToolFailureRepairPlan({
    failedTask: completeTask(),
    failureReason: "找不到清单项：矩阵习题",
    message: "我已经完成矩阵习题",
  });

  assert.equal(repair, null);
});
