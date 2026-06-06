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

test("runResolveIntentStep grounds streaming replies with the pre-resolved contextual answer", async () => {
  const trace: AgentTraceStep[] = [];
  const contextualAnswer = "结合你已有的线性代数计划，建议先补矩阵运算，再进入向量空间。";
  let capturedGroundedAnswer: undefined | string;
  let capturedContext: AgentPromptContext | undefined;

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: false },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    generateStreamingReplyFn: async (args) => {
      capturedGroundedAnswer = args.groundedAnswer;
      capturedContext = args.context;
      args.onToken("模型润色后的回答");

      return {
        text: "模型润色后的回答",
        tokenUsage: {
          contextTokens: 10,
          inputTokens: 2,
          outputTokens: 6,
          providerInputTokens: 12,
          providerOutputTokens: 6,
          source: "provider",
          totalTokens: 18,
        },
      };
    },
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

  assert.equal(result.outcome, "continue");
  assert.match(capturedGroundedAnswer ?? "", /结论/);
  assert.match(capturedGroundedAnswer ?? "", /已有上下文判断/);
  assert.match(capturedGroundedAnswer ?? "", /结合你已有的线性代数计划/);
  assert.equal(capturedContext, promptContext);
  assert.equal(result.data.resolution.intent.reply, "模型润色后的回答");
});

test("runResolveIntentStep emits an arbitration trace before the final intent trace", async () => {
  const trace: AgentTraceStep[] = [];

  const result = await runResolveIntentStep({
    confirmationSignals: { cancel: false, confirm: false },
    context: promptContext,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    emitUsage: () => undefined,
    generateStreamingReplyFn: async (args) => {
      args.onToken("路径回答");

      return {
        text: "路径回答",
        tokenUsage: {
          contextTokens: 10,
          inputTokens: 2,
          outputTokens: 4,
          providerInputTokens: 12,
          providerOutputTokens: 4,
          source: "provider",
          totalTokens: 16,
        },
      };
    },
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

  assert.equal(result.outcome, "continue");
  assert.equal(result.data.resolution.intent.intent, "answer_question");
  assert.equal(trace.some((step) => step.id === "analysis-arbitration" && /意图仲裁/.test(step.title)), true);
});

test("runResolveIntentStep enriches conversational answers with cognitive advisory trace", async () => {
  const trace: AgentTraceStep[] = [];
  let capturedGroundedAnswer = "";
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
    generateStreamingReplyFn: async (args) => {
      capturedGroundedAnswer = args.groundedAnswer ?? "";
      args.onToken(capturedGroundedAnswer);

      return {
        text: capturedGroundedAnswer,
        tokenUsage: {
          contextTokens: 10,
          inputTokens: 2,
          outputTokens: 20,
          providerInputTokens: 12,
          providerOutputTokens: 20,
          source: "provider",
          totalTokens: 32,
        },
      };
    },
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

  assert.equal(result.outcome, "continue");
  assert.match(capturedGroundedAnswer, /结论/);
  assert.match(capturedGroundedAnswer, /Agent 智能化核心开发/);
  assert.doesNotMatch(capturedGroundedAnswer, /厨房收纳/);
  assert.equal(trace.some((step) => step.id === "cognitive-frame" && /认知框架/.test(step.title)), true);
  assert.equal(trace.some((step) => step.id === "cognitive-evidence" && /证据选择/.test(step.title)), true);
  assert.equal(trace.some((step) => step.id === "cognitive-quality" && /回答自检/.test(step.title)), true);
  assert.equal(trace.some((step) => step.id === "cognitive-planner" && /回答规划：fallback/.test(step.title)), true);
});
