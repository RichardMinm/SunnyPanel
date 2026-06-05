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
  assert.equal(capturedGroundedAnswer, contextualAnswer);
  assert.equal(capturedContext, promptContext);
  assert.equal(result.data.resolution.intent.reply, "模型润色后的回答");
});
