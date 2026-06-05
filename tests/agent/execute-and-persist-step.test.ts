import assert from "node:assert/strict";
import { test } from "node:test";

import { executeAgentIntent } from "../../src/lib/agent/executor";
import { runExecuteAndPersistStep } from "../../src/lib/agent/chat-pipeline/execute-and-persist-step";
import type { AgentChatResponse, AgentIntent, AgentTraceStep } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const makeAnswerIntent = (answer: string): Extract<AgentIntent, { intent: "answer_question" }> => ({
  args: { answer },
  intent: "answer_question",
});

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 10,
  inputTokens: 2,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 12,
};

test("learning advice answers leave a follow-up planning context", async () => {
  const result = await executeAgentIntent({
    args: {
      answer: "线性代数建议",
      learningContext: {
        originalMessage: "给我参谋一下线性代数的学习",
        subject: "线性代数",
      },
      suggestAction: "我可以继续拆成学习计划。",
    },
    intent: "answer_question",
  } as Extract<AgentIntent, { intent: "answer_question" }>);
  const pending = result.pendingAction as null | { subject?: string; type?: string };

  assert.equal(pending?.type, "await_learning_followup");
  assert.equal(pending?.subject, "线性代数");
});

test("batch execution path uses transactional execution trace", async () => {
  const trace: AgentTraceStep[] = [];
  const persisted: Array<{ nextPendingAction: AgentChatResponse["pendingAction"] }> = [];

  const result = await runExecuteAndPersistStep({
    batchExecuteIntents: [makeAnswerIntent("第一步完成"), makeAnswerIntent("第二步完成")],
    confirmedActionId: "batch",
    emitStatus: () => undefined,
    emitToken: () => undefined,
    isDirectAnswer: false,
    persistAgentTurn: async (args) => {
      persisted.push({ nextPendingAction: args.nextPendingAction });

      return { id: 77 } as AgentThread;
    },
    pushTrace: (step) => trace.push(step),
    resolution: {
      engine: "workflow",
      intent: makeAnswerIntent("批量执行"),
    },
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  assert.equal(result.assistantMessage, "第一步完成\n\n第二步完成");
  assert.equal(result.pendingAction, null);
  assert.equal(persisted[0]?.nextPendingAction, null);
  assert.equal(trace.some((step) => step.id === "batch-execute-transactional"), true);
  assert.equal(trace.some((step) => step.id === "batch-transaction-step-1"), true);
  assert.equal(trace.some((step) => step.id === "batch-transaction-step-2"), true);
  assert.equal(trace.some((step) => step.id === "batch-execute-parallel"), false);
});

test("unconfirmed compose_plan is blocked before tool execution", async () => {
  const trace: AgentTraceStep[] = [];
  const persisted: Array<{ assistantMessage: string; nextPendingAction: AgentChatResponse["pendingAction"] }> = [];
  const composeIntent: Extract<AgentIntent, { intent: "compose_plan" }> = {
    args: {
      sourceText: "给我参谋一下线性代数的学习；学习画像：目标=考研数二；基础=基础一般；每日时间=每天 1 小时；期限=两个月内完成。",
      title: "线性代数学习计划",
    },
    intent: "compose_plan",
  };

  const result = await runExecuteAndPersistStep({
    confirmedActionId: null,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    isDirectAnswer: false,
    persistAgentTurn: async (args) => {
      persisted.push({
        assistantMessage: args.assistantMessage,
        nextPendingAction: args.nextPendingAction,
      });

      return { id: 78 } as AgentThread;
    },
    pushTrace: (step) => trace.push(step),
    resolution: {
      engine: "workflow",
      intent: composeIntent,
    },
    tokenUsage,
    trace,
    user: { id: 1 },
  });

  assert.match(result.assistantMessage, /Dry-run|确认|不会直接写入/);
  assert.equal(result.pendingAction, null);
  assert.equal(persisted[0]?.nextPendingAction, null);
  assert.equal(trace.some((step) => step.id === "execution-confirmation-guard"), true);
});
