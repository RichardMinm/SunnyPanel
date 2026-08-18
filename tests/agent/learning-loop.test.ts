import assert from "node:assert/strict";
import { test } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  evaluateLearningCandidate,
  runAgentLearningLoop,
  type AgentLearningCandidate,
} from "../../src/lib/agent/learning-loop";
import { persistMemoryWithEmbedding } from "../../src/lib/agent/memory";
import type { AgentMemoryDocument, AgentMemoryInput, AgentMemoryType } from "../../src/lib/agent/memory";
import type { AgentSuggestionDraft } from "../../src/lib/agent/suggestions";
import type { AgentChatResponse, PendingAction } from "../../src/lib/agent/schemas";
import { createModelConfig, type ModelConfig } from "../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../src/lib/agent/llm/model-factory";

const learningModelConfig = (): ModelConfig => {
  const config = createModelConfig({
    apiKey: "sk-learning-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "learning-test-model",
    provider: "openai",
    structuredOutputMode: "json_schema",
  });
  if ("code" in config) throw new Error(config.safeMessage);
  return config;
};

const fakeLearningModelFactory = (output: unknown): ModelFactory => () => ({
  withStructuredOutput: () => ({
    invoke: async () => {
      if (output instanceof Error) throw output;
      return output;
    },
  }),
}) as unknown as BaseChatModel;

const withLearningModelEnabled = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.AGENT_DISABLE_LLM;
  delete process.env.AGENT_DISABLE_LLM;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = previous;
  }
};

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 10,
  inputTokens: 4,
  outputTokens: 6,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 20,
};

const memoryDoc = (overrides: Partial<AgentMemoryDocument>): AgentMemoryDocument => ({
  confidence: 0.9,
  content: "用户偏好回答先给结论，再给必要细节。",
  createdAt: "2026-06-06T00:00:00.000Z",
  id: 1,
  lastUsedAt: null,
  status: "active",
  title: "回答风格偏好",
  type: "preference",
  updatedAt: "2026-06-06T00:00:00.000Z",
  visibility: "private",
  ...overrides,
});

test("learning loop saves explicit answer preference as memory", async () => {
  const saved: AgentMemoryInput[] = [];
  const traceTitles: string[] = [];

  const result = await runAgentLearningLoop({
    assistantMessage: "结论：下一步先做真实问题评测。",
    existingMemories: [],
    intent: "answer_question",
    message: "以后回答先给结论，再讲原因。顺便帮我分析 Agent 下一步。",
    pendingActionAfter: null,
    pendingActionBefore: null,
    pushTrace: (step) => traceTitles.push(step.title),
    sourceThread: 13,
    tokenUsage,
    upsertMemoryFn: async (memory) => {
      saved.push(memory);

      return memoryDoc({
        content: memory.content,
        id: 99,
        sourceThread: 13,
        title: memory.title,
        type: memory.type as AgentMemoryType,
      });
    },
    user: { id: 1 },
  });

  assert.equal(result.savedMemories.length, 1);
  assert.equal(saved[0]?.type, "preference");
  assert.match(saved[0]?.content ?? "", /先给结论/);
  assert.equal(result.decisions[0]?.action, "save_memory");
  assert.equal(result.source, "fallback");
  assert.equal(traceTitles.some((title) => /学习反馈：保存/.test(title)), true);
});

test("learning loop saves explicit correction from learning follow-up as workflow rule", async () => {
  const pendingAction: PendingAction = {
    originalMessage: "请为我规划一个信息安全学习路径，偏蓝队",
    requestedAction: "compose_plan",
    subject: "信息安全（偏蓝队）",
    type: "await_learning_followup",
  };
  const saved: AgentMemoryInput[] = [];

  const result = await runAgentLearningLoop({
    assistantMessage: "好的，我只给学习路径，不进入计划草稿。",
    existingMemories: [],
    intent: "answer_question",
    message: "给出路径即可，并不是计划",
    pendingActionAfter: null,
    pendingActionBefore: pendingAction,
    sourceThread: 13,
    upsertMemoryFn: async (memory) => {
      saved.push(memory);

      return memoryDoc({
        content: memory.content,
        id: 100,
        title: memory.title,
        type: memory.type as AgentMemoryType,
      });
    },
    user: { id: 1 },
  });

  assert.equal(result.savedMemories.length, 1);
  assert.equal(saved[0]?.type, "workflow_rule");
  assert.match(saved[0]?.content ?? "", /路径|路线/);
  assert.match(saved[0]?.content ?? "", /不要默认|不默认|不应默认/);
  assert.match(saved[0]?.content ?? "", /计划/);
});

test("learning loop does not write memory for ordinary learning consultation", async () => {
  let savedCount = 0;
  const result = await runAgentLearningLoop({
    assistantMessage: "结论：先补矩阵和方程组。",
    existingMemories: [],
    intent: "answer_question",
    message: "请为我规划信息安全学习路径，偏蓝队",
    pendingActionAfter: null,
    pendingActionBefore: null,
    upsertMemoryFn: async (memory) => {
      savedCount += 1;

      return memoryDoc({
        content: memory.content,
        id: 101,
        title: memory.title,
        type: memory.type as AgentMemoryType,
      });
    },
    user: { id: 1 },
  });

  assert.equal(savedCount, 0);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.decisions[0]?.action, "ignore");
});

test("learning candidate evaluation skips duplicate existing memory", () => {
  const candidate: AgentLearningCandidate = {
    confidence: 0.92,
    content: "用户偏好回答先给结论，再给必要细节。",
    reason: "用户明确表达长期回答偏好。",
    signal: "explicit_preference",
    source: "fallback",
    title: "回答风格偏好",
    type: "preference",
  };

  const decision = evaluateLearningCandidate(candidate, {
    existingMemories: [memoryDoc({ id: 12 })],
  });

  assert.equal(decision.action, "ignore");
  assert.equal(decision.existingMemoryId, 12);
  assert.match(decision.reason, /重复|已存在/);
});

test("learning loop falls back when LLM extraction is unavailable", async () => {
  const saved: AgentMemoryInput[] = [];
  const result = await withLearningModelEnabled(() => runAgentLearningLoop({
      assistantMessage: "结论：我会减少铺垫。",
      existingMemories: [],
      intent: "answer_question",
      learningModelInvocation: {
        modelConfig: learningModelConfig(),
        modelFactory: fakeLearningModelFactory(new Error("provider unavailable")),
      },
      message: "记住我喜欢少一点铺垫，先说结论。",
      pendingActionAfter: null,
      pendingActionBefore: null,
      upsertMemoryFn: async (memory) => {
        saved.push(memory);

        return memoryDoc({
          content: memory.content,
          id: 102,
          title: memory.title,
          type: memory.type as AgentMemoryType,
        });
      },
      user: { id: 1 },
    }));

  assert.equal(result.source, "fallback");
  assert.equal(saved.length, 1);
  assert.match(saved[0]?.content ?? "", /少一点铺垫|先说结论/);
});

test("learning loop never auto-saves a model-only candidate", async () => {
  const saved: AgentMemoryInput[] = [];
  const suggestions: AgentSuggestionDraft[] = [];
  const result = await withLearningModelEnabled(() => runAgentLearningLoop({
    assistantMessage: "结论：后续会默认短答案。",
    existingMemories: [],
    intent: "answer_question",
    learningModelInvocation: {
      modelConfig: learningModelConfig(),
      modelFactory: fakeLearningModelFactory({
        candidates: [{
          confidence: 0.91,
          content: "用户偏好默认短答案，先给结论，再给必要细节。",
          reason: "用户可能在表达回答风格偏好。",
          signal: "explicit_preference",
          title: "回答长度偏好",
          type: "preference",
        }],
      }),
    },
    message: "这次请简洁一些。",
    pendingActionAfter: null,
    pendingActionBefore: null,
    upsertMemoryFn: async (memory) => {
      saved.push(memory);

      return memoryDoc({
        content: memory.content,
        id: 103,
        title: memory.title,
        type: memory.type as AgentMemoryType,
      });
    },
    upsertSuggestionFn: async (_uniqueKey, suggestion) => {
      if (suggestion) suggestions.push(suggestion);
      return null;
    },
    user: { id: 1 },
  }));

  assert.equal(result.source, "llm");
  assert.equal(saved.length, 0);
  assert.equal(result.decisions[0]?.action, "suggest_memory");
  assert.equal(suggestions.length, 1);
});

test("learning loop turns implicit low-confidence candidates into confirmable suggestions", async () => {
  let savedCount = 0;
  const suggestions: AgentSuggestionDraft[] = [];
  const result = await withLearningModelEnabled(() => runAgentLearningLoop({
    assistantMessage: "结论：我会按路径回答。",
    existingMemories: [],
    intent: "answer_question",
    learningModelInvocation: {
      modelConfig: learningModelConfig(),
      modelFactory: fakeLearningModelFactory({
        candidates: [{
          confidence: 0.7,
          content: "用户可能偏好学习咨询先给路径，不急着生成计划。",
          reason: "用户这轮纠偏像是在表达工作流偏好，但不够明确。",
          signal: "inferred",
          title: "学习咨询偏好候选",
          type: "workflow_rule",
        }],
      }),
    },
    message: "这次给路径就行",
    pendingActionAfter: null,
    pendingActionBefore: null,
    upsertMemoryFn: async (memory) => {
      savedCount += 1;

      return memoryDoc({
        content: memory.content,
        id: 104,
        title: memory.title,
        type: memory.type as AgentMemoryType,
      });
    },
    upsertSuggestionFn: async (_uniqueKey, suggestion) => {
      if (suggestion) {
        suggestions.push(suggestion);
      }

      return null;
    },
    user: { id: 1 },
  }));

  assert.equal(savedCount, 0);
  assert.equal(result.decisions[0]?.action, "suggest_memory");
  assert.equal(result.suggestedMemories.length, 1);
  assert.equal(suggestions.length, 1);
  assert.match(suggestions[0]?.title ?? "", /确认学习/);
  assert.match(suggestions[0]?.suggestedPrompt ?? "", /记住/);
  assert.match(suggestions[0]?.suggestedPrompt ?? "", /先给路径/);
  assert.equal(suggestions[0]?.source, "dashboard");
  assert.equal(suggestions[0]?.riskLevel, "low");
});

test("learning loop save path persists learned memory through the embedding-writing persistence", async () => {
  const embedCalls: Array<{ id: number; text: string }> = [];
  const upsertCalls: AgentMemoryInput[] = [];

  const result = await runAgentLearningLoop({
    assistantMessage: "好的，记住了。",
    existingMemories: [],
    intent: "answer_question",
    // 走 fallback 正则抽取（AGENT_DISABLE_LLM=1）。注入的 upsertMemoryFn 复用真实的 persistMemoryWithEmbedding，
    // 仅替换其底层 upsert/syncEmbedding 依赖，验证“学来的记忆”确实会触发 embedding 写入。
    message: "以后回答先给结论，再讲原因。",
    pendingActionAfter: null,
    pendingActionBefore: null,
    sourceThread: 21,
    upsertMemoryFn: (memory) =>
      persistMemoryWithEmbedding(memory, {
        syncEmbedding: async (id, text) => {
          embedCalls.push({ id, text });

          return [0.2, 0.4, 0.6];
        },
        upsert: async (input) => {
          upsertCalls.push(input);

          return memoryDoc({
            content: input.content,
            id: 7777,
            title: input.title,
            type: input.type as AgentMemoryType,
          });
        },
      }),
    user: { id: 1 },
  });

  assert.equal(result.savedMemories.length, 1);
  assert.equal(upsertCalls.length, 1);
  assert.equal(embedCalls.length, 1);
  assert.equal(embedCalls[0]?.id, 7777);
  assert.match(embedCalls[0]?.text ?? "", /先给结论/);
});
