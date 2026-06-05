import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildIncrementalReplanMessage,
  buildReplanExecutionSnapshot,
  type ReplanInput,
} from "../../src/lib/agent/orchestration/replan";

const baseInput = (overrides: Partial<ReplanInput> = {}): ReplanInput => {
  const failedTask: ReplanInput["failedTask"] = {
    agentRole: "plan",
    args: {
      checklistTitle: "线性代数",
      itemTitle: "矩阵习题",
    },
    dependsOn: ["task-schedule-plan"],
    id: "task-complete-item",
    intent: "complete_plan_item",
    label: "完成清单项",
  };

  return {
    failedTask,
    failedTaskIndex: 1,
    failureReason: "找不到清单项：矩阵习题",
    failureType: "tool_error",
    message: "把线性代数计划排进日程，并完成矩阵习题",
    observations: [
      {
        affectedDocuments: [
          {
            collection: "schedule-items",
            documentId: 21,
            operation: "create",
            rollbackStrategy: "delete_created_documents",
          },
        ],
        agentRole: "schedule",
        collections: ["schedule-items"],
        intent: "schedule_plan",
        label: "排入日程",
        message: "已生成 1 条日程。",
        rollbackAvailable: true,
        status: "auto_executed",
        taskId: "task-schedule-plan",
      },
      {
        agentRole: "plan",
        error: "找不到清单项：矩阵习题",
        intent: "complete_plan_item",
        label: "完成清单项",
        message: "执行失败，等待重规划或用户处理。",
        status: "failed",
        taskId: "task-complete-item",
      },
    ],
    originalPlan: {
      mode: "compound",
      reasoning: "先排期再完成清单。",
      tasks: [
        {
          agentRole: "schedule",
          args: {
            planId: 7,
          },
          dependsOn: [],
          id: "task-schedule-plan",
          intent: "schedule_plan",
          label: "排入日程",
        },
        failedTask,
      ],
    },
    promptContext: {
      checklists: [],
      now: "2026-06-01T22:20:00.000+08:00",
      pendingAction: null,
      plans: [],
    },
    proposals: [
      {
        args: {
          title: "矩阵错题复盘",
        },
        changes: [
          {
            collection: "plans",
            operation: "create",
            preview: "新增计划：矩阵错题复盘",
          },
        ],
        id: "create-review-plan",
        intent: "create_plan",
        requiresConfirmation: true,
        riskLevel: "medium",
        summary: "创建计划「矩阵错题复盘」",
      },
    ],
    queueState: {
      autoExecutedTaskIds: ["task-schedule-plan"],
      blockedTaskIds: [],
      completedTaskIds: ["task-schedule-plan"],
      deferredTaskIds: [],
      failedTaskIds: ["task-complete-item"],
      pendingTaskIds: [],
      proposedTaskIds: [],
      skippedTaskIds: [],
      totalTasks: 2,
    },
    ...overrides,
  };
};

test("buildReplanExecutionSnapshot includes observations, queue state, and proposals", () => {
  const snapshot = buildReplanExecutionSnapshot(baseInput());

  assert.match(snapshot, /已自动执行「排入日程」/);
  assert.match(snapshot, /schedule-items#21 create/);
  assert.match(snapshot, /执行失败「完成清单项」/);
  assert.match(snapshot, /队列状态：总计 2 项，已完成 1 项，失败 1 项/);
  assert.match(snapshot, /待确认操作：创建计划「矩阵错题复盘」/);
});

test("buildIncrementalReplanMessage asks the orchestrator to preserve observed facts", () => {
  const message = buildIncrementalReplanMessage(baseInput());

  assert.match(message, /## 执行观察快照/);
  assert.match(message, /schedule-items#21 create/);
  assert.match(message, /不要重复创建或覆盖已经观察到成功的对象/);
  assert.match(message, /保留已完成任务的结果/);
});
