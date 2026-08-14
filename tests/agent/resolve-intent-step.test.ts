import assert from "node:assert/strict";
import { test } from "node:test";

import { runResolveIntentStep } from "../../src/lib/agent/chat-pipeline/resolve-intent-step";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentChatResponse, AgentTraceStep, PendingAction, ProposedAgentAction } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

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

const action: ProposedAgentAction = {
  args: { title: "测试计划" },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建测试计划",
    },
  ],
  id: "action-create-plan",
  intent: "create_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建测试计划",
};

test("runResolveIntentStep carries resume queue after confirming a pending proposal", async () => {
  const pendingAction: PendingAction = {
    action,
    resumeQueue: {
      completedTaskIds: ["task-create-plan"],
      deferredTaskIds: ["task-followup"],
      mode: "compound",
      orchestrationId: "orch-resume-after-confirm",
      originalMessage: "创建计划并继续说明",
      reasoning: "确认后继续延后队列。",
      tasks: [
        {
          agentRole: "plan",
          args: { title: "测试计划" },
          dependsOn: [],
          id: "task-create-plan",
          intent: "create_plan",
          label: "创建测试计划",
        },
        {
          agentRole: "query",
          args: { answer: "继续说明。" },
          dependsOn: ["task-create-plan"],
          id: "task-followup",
          intent: "answer_question",
          label: "继续说明",
        },
      ],
      type: "await_queue_resume",
    },
    type: "await_confirmation",
  };
  const trace: AgentTraceStep[] = [];

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: true },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    intentModelEngine: "workflow",
    message: "确认",
    modelResolver: async () => null,
    pendingAction,
    persistAgentTurn: async () => ({ id: 42 } as AgentThread),
    pushTrace: (step) => trace.push(step),
    recordAgentConfirmationDecisionFn: async () => undefined,
    recordBatchConfirmationDecisionFn: async () => undefined,
    resolvedHistory: [],
    thread: { id: 42 } as AgentThread,
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  assert.equal(result.outcome, "continue");
  assert.equal(result.data.nextPendingAfterExecute?.type, "await_queue_resume");
  assert.deepEqual(
    result.data.nextPendingAfterExecute?.type === "await_queue_resume"
      ? result.data.nextPendingAfterExecute.deferredTaskIds
      : [],
    ["task-followup"],
  );
});

test("cancelled proposals are persisted as control flow rather than executed intent history", async () => {
  const persisted: Array<{ intent: string; nextPendingAction: PendingAction | null }> = [];
  const trace: AgentTraceStep[] = [];
  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: true, confirm: false },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    intentModelEngine: "workflow",
    message: "取消",
    modelResolver: async () => null,
    pendingAction: { action, type: "await_confirmation" },
    persistAgentTurn: async (args) => {
      persisted.push({ intent: args.intent, nextPendingAction: args.nextPendingAction });
      return { id: 42 } as AgentThread;
    },
    pushTrace: (step) => trace.push(step),
    recordAgentConfirmationDecisionFn: async () => undefined,
    recordBatchConfirmationDecisionFn: async () => undefined,
    resolvedHistory: [],
    thread: { id: 42 } as AgentThread,
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  assert.equal(result.outcome, "early_exit");
  assert.deepEqual(persisted, [{ intent: "clarify", nextPendingAction: null }]);
  if (result.outcome === "early_exit") {
    assert.equal(result.response.intent, "clarify");
  }
});

test("batch confirmations derive a unique receipt action id from their actions", async () => {
  const runBatch = async (
    actions: ProposedAgentAction[],
    orchestrationId?: string,
  ) => {
    const trace: AgentTraceStep[] = [];
    const result = await runResolveIntentStep({
      confirmationSignals: { cancel: false, confirm: true },
      context: promptContext,
      emitStatus: () => undefined,
      emitToken: () => undefined,
      emitUsage: () => undefined,
      intentModelEngine: "workflow",
      message: "确认",
      modelResolver: async () => null,
      pendingAction: {
        actions,
        orchestrationId,
        type: "await_batch_confirmation",
      },
      persistAgentTurn: async () => ({ id: 42 } as AgentThread),
      pushTrace: (step) => trace.push(step),
      recordAgentConfirmationDecisionFn: async () => undefined,
      recordBatchConfirmationDecisionFn: async () => undefined,
      resolvedHistory: [],
      thread: { id: 42 } as AgentThread,
      tokenUsage,
      trace,
      user: { id: 1 },
    });

    assert.equal(result.outcome, "continue");
    return result.data.confirmedActionId;
  };
  const firstId = await runBatch([
    action,
    { ...action, id: "action-create-schedule", intent: "compose_schedule_item" },
  ]);
  const secondId = await runBatch([
    { ...action, id: "action-create-plan-2" },
    { ...action, id: "action-create-schedule-2", intent: "compose_schedule_item" },
  ]);

  assert.notEqual(firstId, "batch");
  assert.notEqual(secondId, "batch");
  assert.notEqual(firstId, secondId);

  const sharedOrchestrationFirst = await runBatch(
    [{ ...action, id: "shared-action-1" }],
    "shared-orchestration",
  );
  const sharedOrchestrationSecond = await runBatch(
    [{ ...action, id: "shared-action-2" }],
    "shared-orchestration",
  );

  assert.notEqual(sharedOrchestrationFirst, sharedOrchestrationSecond);
});

test("runResolveIntentStep reuses the pre-resolved answer without a second model call", async () => {
  const trace: AgentTraceStep[] = [];
  const emitted: string[] = [];
  const contextualAnswer = "结合你已有的线性代数计划，建议先补矩阵运算，再进入向量空间。";

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: false },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: (value) => emitted.push(value),
    emitUsage: () => undefined,
    intentModelEngine: "workflow",
    message: "给我参谋一下线性代数的学习",
    modelResolver: async () => null,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 42 } as AgentThread),
    preResolvedIntent: {
      args: {
        answer: contextualAnswer,
      },
      confidence: 0.9,
      intent: "answer_question",
    },
    pushTrace: (step) => trace.push(step),
    recordAgentConfirmationDecisionFn: async () => undefined,
    recordBatchConfirmationDecisionFn: async () => undefined,
    resolvedHistory: [],
    thread: { id: 42 } as AgentThread,
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B: heuristic consultation path retired.
  assert.equal(result.outcome, "continue");
  assert.deepEqual(emitted, [contextualAnswer]);
});

test("runResolveIntentStep emits an arbitration trace before the final intent trace", async () => {
  const trace: AgentTraceStep[] = [];

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: false },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    intentModelEngine: "workflow",
    message: "请为我规划一个信息安全学习路径，偏蓝队",
    modelResolver: async () => ({
      intent: {
        args: {
          sourceText: "请为我规划一个信息安全学习路径，偏蓝队",
        },
        confidence: 0.8,
        intent: "compose_plan",
      },
    }),
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 43 } as AgentThread),
    pushTrace: (step) => trace.push(step),
    recordAgentConfirmationDecisionFn: async () => undefined,
    recordBatchConfirmationDecisionFn: async () => undefined,
    resolvedHistory: [],
    thread: { id: 43 } as AgentThread,
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B: heuristic resolution path retired.
  assert.equal(result.outcome, "continue");
});

test("runResolveIntentStep enriches conversational answers with cognitive advisory trace", async () => {
  const trace: AgentTraceStep[] = [];
  const context: AgentPromptContext = {
    checklists: [
      {
        groups: [
          {
            items: ["真实问题评测", "上下文证据选择", "回答自检"],
            title: "咨询智能质量门",
          },
        ],
        title: "Agent 咨询智能核心",
      },
      {
        groups: [
          {
            items: ["收纳盒"],
            title: "杂项",
          },
        ],
        title: "厨房收纳",
      },
    ],
    memories: [
      {
        confidence: 0.94,
        content: "用户希望尽快进入 Agent 智能化核心能力开发，智能程度必须用真实问题校验。",
        id: 12,
        lastUsedAt: null,
        title: "Agent 开发偏好",
        type: "project_context",
      },
    ],
    now: "2026-06-06T10:00:00.000+08:00",
    pendingAction: null,
    plans: [
      {
        agentBrief: "把 SunnyPanel Agent 从功能点推进到真实咨询智能，先建立认知回答与评测。",
        priority: "high",
        state: "active",
        title: "Agent 智能化核心开发",
      },
      {
        agentBrief: "整理厨房台面。",
        priority: "low",
        state: "active",
        title: "厨房收纳改造",
      },
    ],
  };

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: false },
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    intentModelEngine: "workflow",
    message: "SunnyPanel Agent 泛化问题怎么推进？",
    modelResolver: async () => null,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 44 } as AgentThread),
    pushTrace: (step) => trace.push(step),
    recordAgentConfirmationDecisionFn: async () => undefined,
    recordBatchConfirmationDecisionFn: async () => undefined,
    resolvedHistory: [],
    thread: { id: 44 } as AgentThread,
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  // R6-C1-D-B: heuristic consultation + cognitive advisory retired.
  assert.equal(result.outcome, "continue");
});
