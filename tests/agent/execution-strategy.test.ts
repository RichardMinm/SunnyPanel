import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildExecutionLoopDirective,
  buildExecutionEvaluation,
  buildTaskObservation,
  executeOrchestrationGraph,
} from "../../src/lib/agent/execution-graph";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { SafeExecutionError } from "../../src/lib/agent/orchestration/safe-execution-failure";
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

const sampleContext = (overrides: Partial<AgentPromptContext> = {}): AgentPromptContext => ({
  checklists: [],
  now: "2026-06-01T22:40:00.000+08:00",
  pendingAction: null,
  plans: [],
  ...overrides,
});

const createPlanAction = {
  args: {
    title: "测试计划",
  },
  changes: [
    {
      collection: "plans",
      operation: "create" as const,
      preview: "新增计划：测试计划",
    },
  ],
  id: "create-plan-action",
  intent: "create_plan" as const,
  requiresConfirmation: true,
  riskLevel: "medium" as const,
  summary: "创建计划「测试计划」",
};

test("buildExecutionEvaluation uses long-term memory to prefer confirmation-first strategy", () => {
  const evaluation = buildExecutionEvaluation({
    context: sampleContext({
      memories: [
        {
          confidence: 0.92,
          content: "涉及写入或修改计划时，必须先询问并确认，不要自动执行。",
          id: 88,
          lastUsedAt: null,
          title: "agent_strategy_confirm_writes",
          type: "workflow_rule",
        },
      ],
    }),
    observations: [
      buildTaskObservation(sampleTask(), {
        action: createPlanAction,
        message: "创建计划「测试计划」",
        status: "proposed",
      }),
    ],
    pendingAction: {
      action: createPlanAction,
      type: "await_confirmation",
    },
    proposals: [createPlanAction],
    queueState: sampleQueueState({
      proposedTaskIds: ["task-1"],
    }),
  });

  assert.equal(evaluation.strategy.mode, "confirm_first");
  assert.deepEqual(evaluation.strategy.memoryIds, [88]);
  assert.match(evaluation.nextStep, /长期记忆/);
  assert.match(evaluation.strategy.constraints.join("\n"), /写入前先确认/);
});

test("buildExecutionEvaluation avoids repeating recently failed workflows", () => {
  const evaluation = buildExecutionEvaluation({
    canReplan: true,
    context: sampleContext({
      agentRuns: [
        {
          completedAt: "2026-06-01T10:00:00.000Z",
          id: 301,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T09:59:00.000Z",
          status: "failed",
          summary: "schedule_plan 因日程冲突失败",
          title: "排入日程失败",
          workflow: "schedule_plan",
        },
        {
          completedAt: "2026-06-01T11:00:00.000Z",
          id: 302,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T10:59:00.000Z",
          status: "failed",
          summary: "schedule_plan 再次失败",
          title: "排入日程失败",
          workflow: "schedule_plan",
        },
      ],
    }),
    observations: [
      buildTaskObservation(sampleTask({
        agentRole: "schedule",
        id: "task-schedule-plan",
        intent: "schedule_plan",
        label: "排入日程",
      }), {
        error: "检测到日程冲突",
        message: "执行失败，等待重规划或用户处理。",
        status: "failed",
      }),
    ],
    pendingAction: null,
    proposals: [],
    queueState: sampleQueueState({
      failedTaskIds: ["task-schedule-plan"],
    }),
  });

  assert.equal(evaluation.action, "replan");
  assert.equal(evaluation.strategy.mode, "avoid_recent_failure");
  assert.deepEqual(evaluation.strategy.recentRunIds, [301, 302]);
  assert.match(evaluation.nextStep, /避免重复失败/);
});

test("buildExecutionEvaluation uses strategy feedback memory to avoid known failed paths", () => {
  const evaluation = buildExecutionEvaluation({
    canReplan: true,
    context: sampleContext({
      memories: [
        {
          confidence: 0.82,
          content: "当 complete_plan_item 因找不到清单项失败时，不要直接重复自动重规划。下一次先核对目标对象、参数和上下文。",
          id: 901,
          lastUsedAt: null,
          title: "策略反馈：complete_plan_item",
          type: "workflow_rule",
        },
      ],
    }),
    observations: [
      buildTaskObservation(sampleTask({
        id: "task-complete-item",
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
      failedTaskIds: ["task-complete-item"],
    }),
  });

  assert.equal(evaluation.strategy.mode, "avoid_recent_failure");
  assert.deepEqual(evaluation.strategy.memoryIds, [901]);
  assert.match(evaluation.strategy.constraints.join("\n"), /先核对目标/);
  assert.match(evaluation.nextStep, /策略反馈记忆/);
});

test("buildExecutionLoopDirective pauses automatic replan for repeated historical failures", () => {
  const evaluation = buildExecutionEvaluation({
    canReplan: true,
    context: sampleContext({
      agentRuns: [
        {
          completedAt: "2026-06-01T10:00:00.000Z",
          id: 301,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T09:59:00.000Z",
          status: "failed",
          summary: "complete_plan_item 找不到清单项",
          title: "完成清单失败",
          workflow: "complete_plan_item",
        },
        {
          completedAt: "2026-06-01T11:00:00.000Z",
          id: 302,
          relatedPlanTitle: "线性代数",
          startedAt: "2026-06-01T10:59:00.000Z",
          status: "failed",
          summary: "complete_plan_item 再次找不到清单项",
          title: "完成清单失败",
          workflow: "complete_plan_item",
        },
      ],
    }),
    observations: [
      buildTaskObservation(sampleTask({
        id: "task-complete-item",
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
      failedTaskIds: ["task-complete-item"],
    }),
  });

  const directive = buildExecutionLoopDirective(evaluation);

  assert.equal(directive.action, "pause_for_user");
  assert.match(directive.assistantMessage, /最近同类任务已经失败 2 次/);
  assert.match(directive.assistantMessage, /避免继续重复失败路径/);
});

test("executeOrchestrationGraph carries memory-based strategy into evaluation", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "需要创建计划。",
    tasks: [sampleTask()],
  };

  const result = await executeOrchestrationGraph(
    plan,
    {
      createActionId: () => "create-plan-action",
    },
    {
      promptContext: sampleContext({
        memories: [
          {
            confidence: 0.9,
            content: "所有写入动作都要先确认。",
            id: 91,
            lastUsedAt: null,
            title: "agent_strategy_confirm_writes",
            type: "workflow_rule",
          },
        ],
      }),
    },
  );

  assert.equal(result.evaluation.strategy.mode, "confirm_first");
  assert.deepEqual(result.evaluation.strategy.memoryIds, [91]);
});

test("executeOrchestrationGraph pauses replan when repeated history predicts the same failure", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "完成清单项。",
    tasks: [
      sampleTask({
        args: {
          checklistTitle: "线性代数",
          itemTitle: "矩阵习题",
        },
        id: "task-complete-item",
        intent: "complete_plan_item",
        label: "完成清单项",
      }),
    ],
  };
  let replanCalled = false;
  let feedbackMemoryCalls = 0;

  const result = await executeOrchestrationGraph(
    plan,
    {
      resolveChecklistItem: async () => {
        throw new SafeExecutionError("checklist_item_not_found");
      },
    },
    {
      message: "完成线性代数的矩阵习题",
      promptContext: sampleContext({
        agentRuns: [
          {
            completedAt: "2026-06-01T10:00:00.000Z",
            id: 401,
            relatedPlanTitle: "线性代数",
            startedAt: "2026-06-01T09:59:00.000Z",
            status: "failed",
            summary: "complete_plan_item 找不到清单项",
            title: "完成清单失败",
            workflow: "complete_plan_item",
          },
          {
            completedAt: "2026-06-01T11:00:00.000Z",
            id: 402,
            relatedPlanTitle: "线性代数",
            startedAt: "2026-06-01T10:59:00.000Z",
            status: "failed",
            summary: "complete_plan_item 再次失败",
            title: "完成清单失败",
            workflow: "complete_plan_item",
          },
        ],
      }),
      replanTaskFailure: async () => {
        replanCalled = true;

        return {
          plan: {
            mode: "single",
            reasoning: "不应该进入重规划。",
            tasks: [],
          },
          status: "success",
        };
      },
      recordStrategyFeedbackMemory: async (input) => {
        feedbackMemoryCalls += 1;
        assert.equal(input.evaluation.strategy.mode, "avoid_recent_failure");
        assert.equal(input.originalMessage, "完成线性代数的矩阵习题");
      },
    },
  );

  assert.equal(replanCalled, false);
  assert.equal(feedbackMemoryCalls, 1);
  assert.equal(result.evaluation.action, "replan");
  assert.equal(result.evaluation.strategy.mode, "avoid_recent_failure");
  assert.match(result.assistantMessage, /最近同类任务已经失败 2 次/);
  const pendingAction = result.pendingAction as null | {
    failedTaskId?: string;
    originalMessage?: string;
    type?: string;
  };

  assert.equal(pendingAction?.type, "await_strategy_resume");
  assert.equal(pendingAction?.failedTaskId, "task-complete-item");
  assert.equal(pendingAction?.originalMessage, "完成线性代数的矩阵习题");
});
