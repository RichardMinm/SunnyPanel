import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildExecutionDecisionTraceStep,
  buildObservationTraceStep,
  buildTaskObservation,
  decideNextActionFromObservations,
  executeOrchestrationGraph,
  formatTaskObservation,
  summarizeExecutionQueue,
} from "../../src/lib/agent/execution-graph";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { parsePendingAction } from "../../src/lib/agent/schemas";
import type { ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { ReplanInput } from "../../src/lib/agent/orchestration/replan";
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

test("buildTaskObservation derives real affected documents from executed rollback payload", () => {
  const observation = buildTaskObservation(sampleTask({
    id: "task-schedule-plan",
    intent: "schedule_plan",
    label: "排入日程",
  }), {
    message: "已生成 2 条日程。",
    rollbackPayload: {
      strategy: "delete_created_documents",
      target: {
        collection: "schedule-items",
        documentIds: [11, 12],
      },
    },
    status: "auto_executed",
  });

  assert.deepEqual(observation.affectedDocuments, [
    {
      collection: "schedule-items",
      documentId: 11,
      operation: "create",
      rollbackStrategy: "delete_created_documents",
    },
    {
      collection: "schedule-items",
      documentId: 12,
      operation: "create",
      rollbackStrategy: "delete_created_documents",
    },
  ]);
  assert.deepEqual(observation.collections, ["schedule-items"]);
  assert.equal(observation.rollbackAvailable, true);
  assert.match(formatTaskObservation(observation), /schedule-items#11 create/);
  assert.match(formatTaskObservation(observation), /schedule-items#12 create/);
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

test("buildExecutionDecisionTraceStep explains why the loop waits for confirmation", () => {
  const traceStep = buildExecutionDecisionTraceStep({
    assistantMessage: "创建计划前需要确认。",
    executedCount: 0,
    observations: [
      buildTaskObservation(sampleTask({ id: "task-create-plan" }), {
        action: sampleAction(),
        message: "创建计划「测试计划」",
        status: "proposed",
      }),
      buildTaskObservation(sampleTask({ id: "task-after-plan", label: "说明后续安排" }), {
        message: "前置写操作正在等待用户确认，后续任务已延后。",
        status: "deferred",
      }),
    ],
    pendingAction: {
      action: sampleAction(),
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
    proposals: [sampleAction()],
    queueState: {
      autoExecutedTaskIds: [],
      blockedTaskIds: [],
      completedTaskIds: [],
      deferredTaskIds: ["task-after-plan"],
      failedTaskIds: [],
      pendingTaskIds: [],
      proposedTaskIds: ["task-create-plan"],
      skippedTaskIds: [],
      totalTasks: 2,
    },
  });

  assert.equal(traceStep.title, "决策：等待确认后继续");
  assert.match(String(traceStep.detail), /待确认 1 项/);
  assert.match(String(traceStep.detail), /延后 1 项/);
  assert.match(String(traceStep.detail), /确认后可继续恢复/);
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

test("executeOrchestrationGraph keeps low-risk writes behind confirmation", async () => {
  let executions = 0;
  let executedActionId: string | null = null;
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "取消低风险日程。",
    tasks: [
      {
        agentRole: "schedule",
        args: { itemId: 88 },
        dependsOn: [],
        id: "task-cancel",
        intent: "cancel_schedule_item",
        label: "取消晨间复盘",
      },
    ],
  };

  const result = await executeOrchestrationGraph(
    plan,
    {
      createActionId: () => "cancel-action-88",
      resolveScheduleItem: async () => ({
        date: "2026-06-23",
        id: 88,
        priority: "medium",
        status: "planned",
        title: "晨间复盘",
      }),
    },
    {
      executeAction: async (_intent, action) => {
        executions += 1;
        executedActionId = action.id;

        return {
          assistantMessage: "已取消晨间复盘",
          pendingAction: null,
          rollbackPayload: {
            beforeSnapshot: { status: "planned" },
            strategy: "restore_schedule_item_status",
            target: {
              collection: "schedule-items",
              documentId: 88,
            },
          },
        };
      },
    },
  );

  assert.equal(executions, 0);
  assert.equal(executedActionId, null);
  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.observations[0]?.status, "proposed");
  assert.equal(result.observations[0]?.actionId, "cancel-action-88");
  assert.match(result.assistantMessage, /确认/);
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

test("executeOrchestrationGraph observes real affected documents after auto execution", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "把计划阶段排入日程。",
    tasks: [
      sampleTask({
        agentRole: "schedule",
        args: {
          planId: 7,
        },
        id: "task-schedule-plan",
        intent: "schedule_plan",
        label: "排入日程",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(
    plan,
    {
      createActionId: () => "schedule-plan-action",
      planCandidates: [
        {
          id: 7,
          title: "线性代数复习",
        },
      ],
      prepareSchedulePlanProposal: async () => ({
        items: [
          {
            date: "2026-08-19",
            endTime: "10:00",
            isAllDay: false,
            phaseTitle: "矩阵基础",
            startTime: "09:00",
            taskKey: "task-001",
            title: "复习矩阵运算",
          },
          {
            date: "2026-08-20",
            endTime: "10:00",
            isAllDay: false,
            phaseTitle: "线性方程组",
            startTime: "09:00",
            taskKey: "task-002",
            title: "练习高斯消元",
          },
        ],
        planFingerprint: "b".repeat(64),
        planId: 7,
        planTitle: "线性代数复习",
        source: "deterministic",
        startDate: "2026-08-19",
      }),
    },
    {
      autoApproval: {
        isFirstActionInThread: false,
        pendingActionHistory: [],
        threadId: 77,
        userPreferences: {
          autoApproveIntents: new Set(),
          autoApproveLowRisk: true,
          autonomyLevel: 3,
          deniedIntents: new Set(),
          maxConsecutiveAutoApprovals: 8,
        },
      },
      executeIntent: async () => ({
        assistantMessage: "已生成 2 条日程。",
        pendingAction: null,
        rollbackPayload: {
          strategy: "delete_created_documents",
          target: {
            collection: "schedule-items",
            documentIds: [21, 22],
          },
        },
      }),
      recordAutoApproval: async () => {},
    },
  );

  assert.equal(result.pendingAction, null);
  assert.equal(result.observations[0]?.status, "auto_executed");
  assert.deepEqual(result.observations[0]?.affectedDocuments, [
    {
      collection: "schedule-items",
      documentId: 21,
      operation: "create",
      rollbackStrategy: "delete_created_documents",
    },
    {
      collection: "schedule-items",
      documentId: 22,
      operation: "create",
      rollbackStrategy: "delete_created_documents",
    },
  ]);
  assert.equal(result.observations[0]?.rollbackAvailable, true);
  assert.match(result.assistantMessage, /已自动执行/);
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
  let observedBeforeReplan: ReplanInput["observations"];

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
        observedBeforeReplan = input.observations;

        return {
          plan: {
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
          },
          status: "success",
        };
      },
    },
  );

  assert.equal(replannedFromTaskId, "task-failed");
  assert.equal(observedBeforeReplan?.some((item) => item.taskId === "task-failed" && item.status === "failed"), true);
  assert.equal(observedBeforeReplan?.some((item) => item.actionId === "stale-create-plan-action"), true);
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /清单项定位失败，已暂停后续计划创建/);
  assert.equal(result.observations.some((item) => item.status === "failed"), true);
  assert.equal(result.observations.some((item) => item.actionId === "stale-create-plan-action"), true);
  assert.equal(result.observations.at(-1)?.status, "answered");
});

test("typed replan failure preserves observations and returns no replacement proposal", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先完成清单项，再创建后续计划。",
    tasks: [
      sampleTask({
        args: { checklistTitle: "高等数学", itemTitle: "反函数习题" },
        id: "task-failed",
        intent: "complete_plan_item",
        label: "完成清单项",
      }),
      sampleTask({ id: "task-proposed", label: "创建后续计划" }),
    ],
  };
  let replanCalls = 0;

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
      replanTaskFailure: async () => {
        replanCalls += 1;
        return {
          reason: "schema_failure",
          safeMessage: "暂时无法可靠重规划，当前状态已保留。",
          status: "unavailable",
        };
      },
    },
  );

  assert.equal(replanCalls, 1);
  assert.equal(result.pendingAction, null);
  assert.deepEqual(result.proposals, []);
  assert.match(result.assistantMessage, /当前状态已保留/);
  assert.equal(result.observations.some((item) => item.status === "failed"), true);
  assert.equal(result.observations.some((item) => item.status === "answered"), false);
});

test("executeOrchestrationGraph prefers semantic repair over generic replan for missing checklist items", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "完成用户刚刚提到的清单项。",
    tasks: [
      sampleTask({
        args: {
          checklistTitle: "线性代数复习",
          groupTitle: "第一阶段",
          itemTitle: "矩阵习题",
        },
        id: "task-complete-missing-item",
        intent: "complete_plan_item",
        label: "完成矩阵习题",
      }),
    ],
  };
  let genericReplanCalled = false;

  const result = await executeOrchestrationGraph(
    plan,
    {
      createActionId: () => "semantic-repair-append-action",
      resolveChecklistGroupForAppend: async () => ({
        question: null,
        resolved: {
          checklist: {
            groups: [
              {
                id: "phase-1",
                items: [],
                title: "第一阶段",
              },
            ],
            id: 42,
            status: "active",
            title: "线性代数复习",
            visibility: "private",
          },
          group: {
            id: "phase-1",
            items: [],
            title: "第一阶段",
          },
          groupIndex: 0,
        },
      }),
      resolveChecklistItem: async () => {
        throw new Error("找不到清单项：矩阵习题");
      },
    },
    {
      message: "我已经完成矩阵习题",
      promptContext,
      recordStrategyFeedbackMemory: async () => {},
      replanTaskFailure: async () => {
        genericReplanCalled = true;

        return {
          plan: {
            mode: "single",
            reasoning: "不应该进入普通重规划。",
            tasks: [],
          },
          status: "success",
        };
      },
    },
  );

  assert.equal(genericReplanCalled, false);
  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0]?.id, "semantic-repair-append-action");
  assert.equal(result.proposals[0]?.intent, "append_plan_item");
  assert.match(result.assistantMessage, /语义修复/);
  assert.match(result.assistantMessage, /矩阵习题/);
  assert.equal(result.observations.some((item) => item.taskId === "task-complete-missing-item" && item.status === "failed"), true);
  assert.equal(result.observations.some((item) => item.intent === "append_plan_item" && item.status === "proposed"), true);
  assert.equal(result.evaluation.action, "wait_for_confirmation");
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
    message: "先说明状态，然后创建计划",
    maxTasksPerRun: 1,
  });

  assert.equal(result.pendingAction?.type, "await_queue_resume");
  assert.equal(result.pendingAction.originalMessage, "先说明状态，然后创建计划");
  assert.deepEqual(result.pendingAction.deferredTaskIds, ["task-create-plan"]);
  assert.deepEqual(result.pendingAction.completedTaskIds, ["task-answer"]);
  assert.equal(result.pendingAction.tasks.length, 2);
  assert.equal(parsePendingAction(result.pendingAction)?.type, "await_queue_resume");
  assert.match(result.assistantMessage, /执行预算/);
  assert.match(result.assistantMessage, /回复「继续」/);
  assert.equal(result.observations.some((item) => item.taskId === "task-create-plan" && item.status === "deferred"), true);
  assert.deepEqual(result.queueState.completedTaskIds, ["task-answer"]);
  assert.deepEqual(result.queueState.deferredTaskIds, ["task-create-plan"]);
  assert.deepEqual(result.queueState.pendingTaskIds, []);
});

test("executeOrchestrationGraph preserves deferred queue behind pending proposals", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先创建计划，再说明后续安排。",
    tasks: [
      sampleTask({
        id: "task-create-plan",
        label: "创建测试计划",
      }),
      sampleTask({
        agentRole: "query",
        args: {
          answer: "创建后再继续说明后续安排。",
        },
        id: "task-answer",
        intent: "answer_question",
        label: "说明后续安排",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(plan, {
    createActionId: () => "create-plan-action",
  }, {
    message: "创建计划并说明后续安排",
    maxTasksPerRun: 1,
  });

  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.pendingAction.resumeQueue?.type, "await_queue_resume");
  assert.deepEqual(result.pendingAction.resumeQueue?.deferredTaskIds, ["task-answer"]);
  assert.deepEqual(result.pendingAction.resumeQueue?.completedTaskIds, ["task-create-plan"]);
  const parsed = parsePendingAction(result.pendingAction);

  assert.equal(parsed?.type, "await_confirmation");
  assert.equal(parsed?.type === "await_confirmation" ? parsed.resumeQueue?.type : null, "await_queue_resume");
});

test("executeOrchestrationGraph pauses dependent tasks after a confirmation proposal", async () => {
  const plan: OrchestratorPlan = {
    mode: "compound",
    reasoning: "先创建计划，确认写入后再说明后续安排。",
    tasks: [
      sampleTask({
        id: "task-create-plan",
        label: "创建测试计划",
      }),
      sampleTask({
        agentRole: "query",
        args: {
          answer: "计划创建后再说明后续安排。",
        },
        dependsOn: ["task-create-plan"],
        id: "task-after-plan",
        intent: "answer_question",
        label: "说明后续安排",
      }),
    ],
  };

  const result = await executeOrchestrationGraph(plan, {
    createActionId: () => "create-plan-action",
  }, {
    message: "创建计划后说明后续安排",
  });

  assert.equal(result.pendingAction?.type, "await_confirmation");
  assert.equal(result.pendingAction.type === "await_confirmation" ? result.pendingAction.action.id : null, "create-plan-action");
  assert.equal(result.pendingAction.type === "await_confirmation" ? result.pendingAction.resumeQueue?.type : null, "await_queue_resume");
  assert.deepEqual(
    result.pendingAction.type === "await_confirmation" ? result.pendingAction.resumeQueue?.deferredTaskIds : null,
    ["task-after-plan"],
  );
  assert.equal(result.observations.some((item) => item.taskId === "task-after-plan" && item.status === "answered"), false);
  assert.equal(result.observations.some((item) => item.taskId === "task-after-plan" && item.status === "deferred"), true);
  assert.match(result.assistantMessage, /已延后/);
});
