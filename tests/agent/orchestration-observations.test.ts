import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildObservationTraceStep,
  buildTaskObservation,
  decideNextActionFromObservations,
  executeOrchestrationGraph,
  formatTaskObservation,
  summarizeExecutionQueue,
} from "../../src/lib/agent/execution-graph";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { OrchestratorPlan, TaskNode } from "../../src/lib/agent/orchestration/types";

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

const sampleAction = (overrides: Partial<ProposedAgentAction> = {}): ProposedAgentAction => ({
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
  id: "action-1",
  intent: "create_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建计划「测试计划」",
  ...overrides,
});

const promptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-05-30T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

test("buildTaskObservation captures action risk and affected collections", () => {
  const observation = buildTaskObservation(sampleTask(), {
    action: sampleAction(),
    message: "等待用户确认后写入。",
    status: "proposed",
  });

  assert.deepEqual(observation, {
    actionId: "action-1",
    agentRole: "plan",
    collections: ["plans"],
    intent: "create_plan",
    label: "创建测试计划",
    message: "等待用户确认后写入。",
    riskLevel: "medium",
    status: "proposed",
    taskId: "task-1",
  });
  assert.match(formatTaskObservation(observation), /待确认/);
  assert.match(formatTaskObservation(observation), /plans/);
});

test("decideNextActionFromObservations replans before confirming stale proposals", () => {
  const decision = decideNextActionFromObservations(
    [
      buildTaskObservation(sampleTask({ id: "task-failed", label: "定位清单项" }), {
        error: "resolver offline",
        message: "执行失败，等待重规划或用户处理。",
        status: "failed",
      }),
      buildTaskObservation(sampleTask({ id: "task-proposed", label: "创建后续计划" }), {
        action: sampleAction(),
        message: "创建计划「测试计划」",
        status: "proposed",
      }),
    ],
    {
      canReplan: true,
      hasPendingProposals: true,
    },
  );

  assert.deepEqual(decision, {
    failedTaskId: "task-failed",
    reason: "resolver offline",
    type: "replan",
  });
});

test("buildObservationTraceStep summarizes task observations for UI trace", () => {
  const traceStep = buildObservationTraceStep([
    buildTaskObservation(sampleTask(), {
      action: sampleAction(),
      message: "等待用户确认后写入。",
      status: "proposed",
    }),
  ]);

  assert.deepEqual(traceStep, {
    detail: "待确认「创建测试计划」 · plans · medium：等待用户确认后写入。",
    id: "orchestrator-observe",
    kind: "analysis",
    status: "done",
    title: "已观察 1 个子任务结果",
  });
});

test("summarizeExecutionQueue reports completed, proposed, failed, and remaining tasks", () => {
  const tasks = [
    sampleTask({ id: "task-answered", label: "回答状态" }),
    sampleTask({ id: "task-proposed", label: "创建计划" }),
    sampleTask({ id: "task-failed", label: "完成清单项" }),
    sampleTask({ id: "task-remaining", label: "安排日程" }),
  ];
  const summary = summarizeExecutionQueue(tasks, [
    buildTaskObservation(tasks[0], {
      message: "已回答。",
      status: "answered",
    }),
    buildTaskObservation(tasks[1], {
      action: sampleAction(),
      message: "创建计划「测试计划」",
      status: "proposed",
    }),
    buildTaskObservation(tasks[2], {
      error: "resolver offline",
      message: "执行失败。",
      status: "failed",
    }),
  ]);

  assert.deepEqual(summary, {
    autoExecutedTaskIds: [],
    blockedTaskIds: [],
    completedTaskIds: ["task-answered"],
    deferredTaskIds: [],
    failedTaskIds: ["task-failed"],
    pendingTaskIds: ["task-remaining"],
    proposedTaskIds: ["task-proposed"],
    skippedTaskIds: [],
    totalTasks: 4,
  });
});

test("executeOrchestrationGraph returns observations for direct answers", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "只需回答用户问题。",
    tasks: [
      sampleTask({
        agentRole: "query",
        args: {
          answer: "当前没有需要写入的动作。",
        },
        intent: "answer_question",
        label: "回答当前状态",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(plan, {});

  assert.equal(result.pendingAction, null);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.status, "answered");
  assert.equal(result.observations[0]?.message, "当前没有需要写入的动作。");
});

test("executeOrchestrationGraph returns observations for proposed writes", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "需要先 dry-run 计划创建。",
    tasks: [sampleTask()],
  };

  const result = await executeOrchestrationGraph(plan, {
    createActionId: () => "create-plan-action",
  });

  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.actionId, "create-plan-action");
  assert.equal(result.observations[0]?.status, "proposed");
  assert.equal(result.observations[0]?.riskLevel, "medium");
  assert.deepEqual(result.observations[0]?.collections, ["plans"]);
});

test("executeOrchestrationGraph replans failed compound work before returning stale proposals", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先完成清单项，再创建后续计划。",
    tasks: [
      sampleTask({
        args: {
          checklistTitle: "高等数学",
          itemTitle: "反函数习题",
        },
        id: "task-failed",
        intent: "complete_plan_item",
        label: "完成清单项",
      }),
      sampleTask({
        id: "task-proposed",
        label: "创建后续计划",
      }),
    ],
  };
  let replannedFromTaskId: string | null = null;

  const result = await executeOrchestrationGraph(
    plan,
    {
      createActionId: () => "stale-create-plan-action",
      resolveChecklistItem: async () => {
        throw new Error("resolver offline");
      },
    },
    {
      message: "完成反函数习题后创建复盘计划",
      promptContext,
      replanTaskFailure: async (input) => {
        replannedFromTaskId = input.failedTask.id;

        return {
          mode: "single",
          reasoning: "清单项定位失败，先向用户说明并暂停后续写入。",
          tasks: [
            sampleTask({
              agentRole: "query",
              args: {
                answer: "清单项定位失败，已暂停后续计划创建。",
              },
              id: "task-replanned-answer",
              intent: "answer_question",
              label: "说明失败原因",
            }),
          ],
        };
      },
    },
  );

  assert.equal(replannedFromTaskId, "task-failed");
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /清单项定位失败，已暂停后续计划创建/);
  assert.equal(result.observations.some((item) => item.status === "failed"), true);
  assert.equal(result.observations.some((item) => item.actionId === "stale-create-plan-action"), true);
  assert.equal(result.observations.at(-1)?.status, "answered");
});

test("executeOrchestrationGraph pauses remaining tasks when max task budget is reached", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先回答，再创建计划。",
    tasks: [
      sampleTask({
        agentRole: "query",
        args: {
          answer: "先说明当前状态。",
        },
        id: "task-answer",
        intent: "answer_question",
        label: "回答当前状态",
      }),
      sampleTask({
        id: "task-create-plan",
        label: "创建后续计划",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(plan, {}, {
    maxTasksPerRun: 1,
  });

  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /执行预算/);
  assert.equal(result.observations.some((item) => item.taskId === "task-create-plan" && item.status === "deferred"), true);
  assert.deepEqual(result.queueState.completedTaskIds, ["task-answer"]);
  assert.deepEqual(result.queueState.deferredTaskIds, ["task-create-plan"]);
  assert.deepEqual(result.queueState.pendingTaskIds, []);
});
