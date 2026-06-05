import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildExecutionDecisionTraceStep,
  buildExecutionEvaluation,
  buildTaskObservation,
  executeOrchestrationGraph,
} from "../../src/lib/agent/execution-graph";
import type { ExecutionQueueState, OrchestratorPlan, TaskNode } from "../../src/lib/agent/orchestration/types";

const sampleTask = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  agentRole: "plan",
  args: {
    title: "测试计划",
  },
  dependsOn: [],
  id: "task-1",
  intent: "create_plan",
  label: "创建测试计划",
  ...overrides,
});

const sampleQueueState = (overrides: Partial<ExecutionQueueState> = {}): ExecutionQueueState => ({
  autoExecutedTaskIds: [],
  blockedTaskIds: [],
  completedTaskIds: [],
  deferredTaskIds: [],
  failedTaskIds: [],
  pendingTaskIds: [],
  proposedTaskIds: [],
  skippedTaskIds: [],
  totalTasks: 1,
  ...overrides,
});

test("buildExecutionEvaluation recommends replanning when a failed observation can be replanned", () => {
  const evaluation = buildExecutionEvaluation({
    canReplan: true,
    observations: [
      buildTaskObservation(sampleTask({
        id: "task-failed",
        intent: "complete_plan_item",
        label: "完成清单项",
      }), {
        error: "找不到清单项",
        message: "执行失败，等待重规划或用户处理。",
        status: "failed",
      }),
    ],
    pendingAction: null,
    proposals: [],
    queueState: sampleQueueState({
      failedTaskIds: ["task-failed"],
      totalTasks: 1,
    }),
  });

  assert.equal(evaluation.action, "replan");
  assert.equal(evaluation.failedTaskId, "task-failed");
  assert.match(evaluation.reason, /找不到清单项/);
  assert.match(evaluation.nextStep, /重规划/);
});

test("buildExecutionEvaluation waits for confirmation and preserves resume context", () => {
  const evaluation = buildExecutionEvaluation({
    observations: [
      buildTaskObservation(sampleTask({ id: "task-create-plan" }), {
        action: {
          args: {
            title: "测试计划",
          },
          changes: [
            {
              collection: "plans",
              operation: "create",
              preview: "新增计划：测试计划",
            },
          ],
          id: "create-plan-action",
          intent: "create_plan",
          requiresConfirmation: true,
          riskLevel: "medium",
          summary: "创建计划「测试计划」",
        },
        message: "创建计划「测试计划」",
        status: "proposed",
      }),
    ],
    pendingAction: {
      action: {
        args: {
          title: "测试计划",
        },
        changes: [
          {
            collection: "plans",
            operation: "create",
            preview: "新增计划：测试计划",
          },
        ],
        id: "create-plan-action",
        intent: "create_plan",
        requiresConfirmation: true,
        riskLevel: "medium",
        summary: "创建计划「测试计划」",
      },
      resumeQueue: {
        completedTaskIds: ["task-create-plan"],
        deferredTaskIds: ["task-after-plan"],
        mode: "compound",
        originalMessage: "创建计划后说明安排",
        reasoning: "先创建计划再继续。",
        tasks: [],
        type: "await_queue_resume",
      },
      type: "await_confirmation",
    },
    proposals: [],
    queueState: sampleQueueState({
      deferredTaskIds: ["task-after-plan"],
      proposedTaskIds: ["task-create-plan"],
      totalTasks: 2,
    }),
  });

  assert.equal(evaluation.action, "wait_for_confirmation");
  assert.deepEqual(evaluation.deferredTaskIds, ["task-after-plan"]);
  assert.match(evaluation.nextStep, /确认后继续恢复 1 个延后子任务/);
});

test("executeOrchestrationGraph returns an execution evaluation for proposed writes", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "需要先 dry-run 计划创建。",
    tasks: [sampleTask()],
  };

  const result = await executeOrchestrationGraph(plan, {
    createActionId: () => "create-plan-action",
  });

  assert.equal(result.evaluation.action, "wait_for_confirmation");
  assert.equal(result.evaluation.confidence >= 0.8, true);
  assert.match(result.evaluation.summary, /待确认/);
  assert.match(buildExecutionDecisionTraceStep(result).detail ?? "", /执行评估/);
});
