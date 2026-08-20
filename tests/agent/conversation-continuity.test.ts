import assert from "node:assert/strict";
import test from "node:test";

import {
  detectWorkspaceCatalogScope,
  resolveWorkspaceCatalogIntent,
} from "../../src/lib/agent/conversation/workspace-catalog-query";
import {
  buildLangChainOrchestratorMessages,
  buildLangChainSystemPrompt,
  projectOrchestratorFailureToSafePlan,
} from "../../src/lib/agent/orchestration/langchain-orchestrator";
import { runOrchestrationStep } from "../../src/lib/agent/chat-pipeline/orchestration-step";
import { normalizeChecklistProgressArgs } from "../../src/lib/agent/progress";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentChatResponse } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const context: AgentPromptContext = {
  checklists: [{
    completedItems: 2,
    groups: [],
    id: 21,
    status: "in_progress",
    title: "FastJSON 漏洞复现清单",
    totalItems: 4,
  }],
  now: "2026-07-29T10:00:00.000+08:00",
  pendingAction: null,
  plans: [{
    id: 11,
    priority: "high",
    state: "active",
    title: "FastJSON 安全研究",
  }],
};

test("workspace catalog query deterministically lists visible plans and checklists", () => {
  assert.deepEqual(
    detectWorkspaceCatalogScope("有哪些清单和计划呢？"),
    { checklists: true, plans: true },
  );

  const intent = resolveWorkspaceCatalogIntent(
    "有哪些清单和计划呢？",
    context,
  );

  assert.equal(intent?.intent, "answer_question");
  assert.match(intent?.args.answer ?? "", /FastJSON 安全研究/);
  assert.match(intent?.args.answer ?? "", /FastJSON 漏洞复现清单/);
  assert.match(intent?.args.answer ?? "", /2\/4 已完成/);
});

test("workspace catalog boundary does not capture progress or mutation requests", () => {
  assert.equal(detectWorkspaceCatalogScope("查看计划进度"), null);
  assert.equal(detectWorkspaceCatalogScope("创建一个计划和清单"), null);
});

test("orchestrator receives bounded recent dialogue before the current reply", () => {
  const messages = buildLangChainOrchestratorMessages(
    "今天的计划吧",
    context,
    [
      {
        content: "我今天要完成 FastJSON 1.2.83 和 2.0.62 的漏洞复现。",
        role: "user",
      },
      {
        content: "你希望创建研究计划，还是记录为任务？",
        role: "assistant",
      },
    ],
  );

  const currentIndex = messages.findIndex(
    (entry) => entry.content === "今天的计划吧",
  );
  const questionIndex = messages.findIndex(
    (entry) => entry.content.includes("创建研究计划"),
  );

  assert.ok(questionIndex > 0);
  assert.ok(currentIndex > questionIndex);
  assert.match(
    messages[0]?.content ?? "",
    /回答最近一条 Assistant 问题/,
  );
});

test("timeout fallback reports a service timeout instead of blaming user ambiguity", () => {
  const plan = projectOrchestratorFailureToSafePlan("timeout");
  const question = String(plan.tasks[0]?.args.question ?? "");

  assert.match(question, /响应超时/);
  assert.doesNotMatch(question, /无法可靠理解/);
});

test("trusted protocol requires follow-up answers to use recent dialogue", () => {
  const prompt = buildLangChainSystemPrompt();

  assert.match(prompt, /最近对话历史/);
  assert.match(prompt, /不得重复询问已经回答的同一字段/);
});

test("orchestration runtime forwards recent history to the LangChain call", async () => {
  const history = [
    {
      content: "我今天要完成 FastJSON 漏洞复现。",
      role: "user" as const,
    },
    {
      content: "你希望创建研究计划，还是记录为任务？",
      role: "assistant" as const,
    },
  ];
  let receivedHistory: readonly typeof history[number][] | undefined;
  const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
    contextTokens: 2,
    inputTokens: 2,
    outputTokens: 0,
    source: "estimate",
    totalTokens: 4,
  };

  const result = await runOrchestrationStep({
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "今天的计划吧",
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 36 }) as AgentThread,
    pushTrace: () => undefined,
    resolvedHistory: history,
    runOrchestratorResultFn: async (_message, _context, _signal, options) => {
      receivedHistory = options?.history;
      return {
        plan: {
          mode: "single",
          reasoning: "承接上一轮，生成计划草稿。",
          source: "llm",
          tasks: [{
            agentRole: "plan",
            args: {
              goal: "完成 FastJSON 漏洞复现",
              sourceText: "我今天要完成 FastJSON 漏洞复现。",
            },
            dependsOn: [],
            id: "t1",
            intent: "compose_plan",
            label: "生成研究计划",
          }],
        },
        schedulePlanReferenceCorrectionCode: null,
        status: "success",
      };
    },
    tokenUsage,
    trace: [],
    user: { id: 1 },
  });

  assert.equal(result.outcome, "continue");
  assert.deepEqual(receivedHistory, history);
});

test("workspace catalog query bypasses the Provider orchestrator", async () => {
  let orchestratorCalled = false;
  const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
    contextTokens: 2,
    inputTokens: 2,
    outputTokens: 0,
    source: "estimate",
    totalTokens: 4,
  };

  const result = await runOrchestrationStep({
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: "有哪些清单和计划呢？",
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 36 }) as AgentThread,
    pushTrace: () => undefined,
    runOrchestratorFn: async () => {
      orchestratorCalled = true;
      throw new Error("Catalog queries must not call the Provider.");
    },
    tokenUsage,
    trace: [],
    user: { id: 1 },
  });

  assert.equal(orchestratorCalled, false);
  assert.equal(result.outcome, "continue");
  if (result.outcome !== "continue") {
    assert.fail("Expected a deterministic pre-resolved catalog intent.");
  }
  assert.equal(result.data.preResolvedIntent?.intent, "answer_question");
  assert.match(
    result.data.preResolvedIntent?.intent === "answer_question"
      ? result.data.preResolvedIntent.args.answer
      : "",
    /FastJSON 安全研究/,
  );
});

test("checklist progress is normalized to the checklist query path", () => {
  assert.deepEqual(
    normalizeChecklistProgressArgs({
      checklistTitle: "FastJSON 漏洞复现清单",
      scope: "all",
    }),
    {
      checklistTitle: "FastJSON 漏洞复现清单",
      scope: "checklists",
    },
  );
});
