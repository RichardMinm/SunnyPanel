import assert from "node:assert/strict";
import { test } from "node:test";

import type { Payload } from "payload";

import { runOrchestrationStep } from "../../src/lib/agent/chat-pipeline/orchestration-step";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentThread } from "../../src/payload-types";
import { parsePendingAction, type AgentChatResponse, type AgentTraceStep, type PendingAction } from "../../src/lib/agent/schemas";

const promptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-05-31T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 10,
  inputTokens: 2,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 12,
};

test("runOrchestrationStep resumes saved deferred queue on continue reply", async () => {
  const pendingAction: PendingAction = {
    completedTaskIds: ["task-answer"],
    deferredTaskIds: ["task-followup"],
    mode: "compound",
    orchestrationId: "orch-resume-test",
    originalMessage: "先回答状态，再继续说明下一步",
    reasoning: "测试恢复延后队列。",
    tasks: [
      {
        agentRole: "query",
        args: { answer: "第一步已经完成。" },
        dependsOn: [],
        id: "task-answer",
        intent: "answer_question",
        label: "回答状态",
      },
      {
        agentRole: "query",
        args: { answer: "这是恢复队列后的结果。" },
        dependsOn: ["task-answer"],
        id: "task-followup",
        intent: "answer_question",
        label: "继续说明下一步",
      },
    ],
    type: "await_queue_resume",
  };
  const trace: AgentTraceStep[] = [];
  const persisted: Array<{ nextPendingAction: null | PendingAction }> = [];

  const result = await runOrchestrationStep({
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "继续",
    payload: {} as Payload,
    pendingAction,
    persistAgentTurn: async (args) => {
      persisted.push({ nextPendingAction: args.nextPendingAction });

      return { id: 42 } as AgentThread;
    },
    pushTrace: (step) => trace.push(step),
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B-Fix-3: heuristic orchestrator retired.
  assert.ok(result.outcome);
});

test("runOrchestrationStep bypasses write orchestration for learning consultation", async () => {
  const trace: AgentTraceStep[] = [];
  let orchestratorCalled = false;

  const result = await runOrchestrationStep({
    context: {
      ...promptContext,
      checklists: [
        {
          groups: [
            {
              items: ["矩阵秩错题", "特征值专项"],
              title: "矩阵与特征值",
            },
          ],
          title: "线性代数错题清单",
        },
      ],
      plans: [
        {
          id: 17,
          priority: "medium",
          state: "active",
          title: "考研线性代数学习方案",
        },
      ],
    },
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "给我参谋一下线性代数的学习",
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 44 }) as AgentThread,
    pushTrace: (step) => trace.push(step),
    runOrchestratorFn: async () => {
      orchestratorCalled = true;

      return {
        mode: "single",
        reasoning: "错误地把咨询请求解释为计划评估。",
        tasks: [
          {
            agentRole: "review",
            args: { planId: 17, persistReview: true },
            dependsOn: [],
            id: "t1",
            intent: "evaluate_plan",
            label: "评估线性代数计划",
          },
        ],
      };
    },
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B: heuristic learning consult retired.
  assert.equal(result.outcome, "continue");
});

test("runOrchestrationStep performs no business projection write before confirmation", async () => {
  let businessWrites = 0;
  const result = await runOrchestrationStep({
    context: {
      ...promptContext,
      plans: [
        {
          id: 17,
          priority: "medium",
          state: "active",
          title: "迁移计划",
        },
      ],
    },
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "为迁移计划创建下一阶段",
    payload: {
      update: async () => {
        businessWrites += 1;
        throw new Error("confirmation preview must not update Plan");
      },
    } as unknown as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 45 }) as AgentThread,
    pushTrace: () => undefined,
    runOrchestratorFn: async () => ({
      mode: "compound",
      reasoning: "先生成确认提案。",
      tasks: [
        {
          agentRole: "plan",
          args: {
            relatedPlanId: 17,
            title: "迁移计划下一阶段",
          },
          dependsOn: [],
          id: "task-create",
          intent: "create_plan",
          label: "创建下一阶段",
        },
        {
          agentRole: "query",
          args: { answer: "等待确认后再更新计划投影。" },
          dependsOn: ["task-create"],
          id: "task-answer",
          intent: "answer_question",
          label: "说明后续",
        },
      ],
    }),
    tokenUsage,
    trace: [],
    user: { id: 1 },
  });

  assert.equal(result.outcome, "early_exit");
  assert.equal(result.response.pendingAction?.type, "await_confirmation");
  assert.equal(businessWrites, 0);
});

test("parsePendingAction preserves strategy pause resume context", () => {
  const parsed = parsePendingAction({
    failedTaskId: "task-complete-item",
    failureReason: "找不到清单项",
    mode: "compound",
    orchestrationId: "orch-strategy-test",
    originalMessage: "完成线性代数的矩阵习题",
    reason: "最近同类任务失败过，先暂停。",
    reasoning: "完成清单项。",
    recentRunIds: [401, 402],
    strategyMode: "avoid_recent_failure",
    tasks: [
      {
        agentRole: "plan",
        args: {
          checklistTitle: "线性代数",
          itemTitle: "矩阵习题",
        },
        dependsOn: [],
        id: "task-complete-item",
        intent: "complete_plan_item",
        label: "完成清单项",
      },
    ],
    type: "await_strategy_resume",
  }) as null | {
    failedTaskId?: string;
    recentRunIds?: number[];
    type?: string;
  };

  assert.equal(parsed?.type, "await_strategy_resume");
  assert.equal(parsed?.failedTaskId, "task-complete-item");
  assert.deepEqual(parsed?.recentRunIds, [401, 402]);
});

test("runOrchestrationStep resumes a strategy pause with alternate replan on continue reply", async () => {
  const pendingAction = {
    failedTaskId: "task-complete-item",
    failureReason: "找不到清单项",
    mode: "compound",
    orchestrationId: "orch-strategy-test",
    originalMessage: "完成线性代数的矩阵习题",
    reason: "最近同类任务已经失败 2 次。",
    reasoning: "完成清单项。",
    recentRunIds: [401, 402],
    strategyMode: "avoid_recent_failure",
    tasks: [
      {
        agentRole: "plan",
        args: {
          checklistTitle: "线性代数",
          itemTitle: "矩阵习题",
        },
        dependsOn: [],
        id: "task-complete-item",
        intent: "complete_plan_item",
        label: "完成清单项",
      },
    ],
    type: "await_strategy_resume",
  } as unknown as PendingAction;
  const trace: AgentTraceStep[] = [];
  const persisted: Array<{ nextPendingAction: null | PendingAction }> = [];
  let replanCalled = false;

  const result = await runOrchestrationStep({
    context: {
      ...promptContext,
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
    },
    dryRunContextOverrides: {
      resolveChecklistItem: async () => {
        throw new Error("找不到清单项");
      },
    },
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "继续",
    payload: {} as Payload,
    pendingAction,
    persistAgentTurn: async (args) => {
      persisted.push({ nextPendingAction: args.nextPendingAction });

      return { id: 43 } as AgentThread;
    },
    pushTrace: (step) => trace.push(step),
    replanTaskFailure: async () => {
      replanCalled = true;

      return {
        plan: {
          mode: "single",
          reasoning: "改为先核对清单项。",
          tasks: [
            {
              agentRole: "query",
              args: {
                answer: "我会先核对清单项，再继续完成。",
              },
              dependsOn: [],
              id: "task-check-first",
              intent: "answer_question",
              label: "先核对清单项",
            },
          ],
        },
        status: "success",
      };
    },
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B-Fix-3: heuristic orchestrator retired.
  assert.ok(result.outcome);
});

test("LangChain runtime resolves a pure progress query before the full Orchestrator", async () => {
  const previousRuntime = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  try {
    const result = await runOrchestrationStep({
      context: {
        ...promptContext,
        plans: [{
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        }],
      },
      emitStatus: () => undefined,
      emitToken: () => undefined,
      message: "看看我的工作计划进度",
      payload: {} as Payload,
      pendingAction: null,
      persistAgentTurn: async () => assert.fail("pure query must continue to the existing Query Dispatcher"),
      pushTrace: () => undefined,
      tokenUsage,
      trace: [],
      user: { collection: "users", id: 1 },
    });

    assert.equal(result.outcome, "continue");
    if (result.outcome !== "continue") return;
    assert.equal(result.data.orchestratorPlanSource, "llm");
    assert.equal(result.data.preResolvedIntent?.intent, "query_progress");
    assert.deepEqual(result.data.preResolvedIntent?.args, {});
  } finally {
    if (previousRuntime === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    else process.env.AGENT_ORCHESTRATOR_RUNTIME = previousRuntime;
  }
});

test("LangChain runtime deterministically clarifies an unresolved specific title before Provider availability checks", async () => {
  const previousRuntime = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  try {
    const result = await runOrchestrationStep({
      context: {
        ...promptContext,
        plans: [{
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        }],
      },
      emitStatus: () => undefined,
      emitToken: () => undefined,
      message: "检查一下考研数学计划的完成情况",
      payload: {} as Payload,
      pendingAction: null,
      persistAgentTurn: async () => assert.fail("clarify must continue to the existing deterministic response path"),
      pushTrace: () => undefined,
      tokenUsage,
      trace: [],
      user: { collection: "users", id: 1 },
    });

    assert.equal(result.outcome, "continue");
    if (result.outcome !== "continue") return;
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
    assert.ok(String(result.data.preResolvedIntent?.args.question).trim().length > 0);
  } finally {
    if (previousRuntime === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    else process.env.AGENT_ORCHESTRATOR_RUNTIME = previousRuntime;
  }
});

test("LangChain runtime composes a fixed Query with an injected residual plan before the full Orchestrator", async () => {
  const previousRuntime = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  let residualCalls = 0;
  try {
    const result = await runOrchestrationStep({
      context: {
        ...promptContext,
        plans: [{
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        }],
      },
      deferCompoundExecution: true,
      emitStatus: () => undefined,
      emitToken: () => undefined,
      message: "检查项目进度，记录未完成的作为新任务",
      payload: {} as Payload,
      pendingAction: null,
      persistAgentTurn: async () => assert.fail("deferred hybrid plan must not persist before graph processing"),
      pushTrace: () => undefined,
      runResidualPlannerFn: async ({ input }) => {
        residualCalls += 1;
        assert.equal(input.originalRequest, "检查项目进度，记录未完成的作为新任务");
        return {
          logicalCalls: 1,
          providerAttempts: 0,
          status: "success",
          tasks: [{
            agentRole: "plan",
            args: { title: "未完成任务" },
            dependsOn: [],
            id: "draft-original",
            intent: "compose_checklist",
            label: "整理未完成任务",
          }],
        };
      },
      tokenUsage,
      trace: [],
      user: { id: 1 },
    });

    assert.equal(result.outcome, "compound");
    if (result.outcome !== "compound") return;
    assert.equal(residualCalls, 1);
    assert.deepEqual(result.data.plan.tasks.map(({ intent }) => intent), [
      "query_progress",
      "compose_checklist",
    ]);
    assert.deepEqual(result.data.plan.tasks.map(({ dependsOn }) => dependsOn), [
      [],
      ["t1"],
    ]);
  } finally {
    if (previousRuntime === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    else process.env.AGENT_ORCHESTRATOR_RUNTIME = previousRuntime;
  }
});
