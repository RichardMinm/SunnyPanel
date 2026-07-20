import assert from "node:assert/strict";
import { test } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";

import {
  ANSWER_MAX_OUTPUT_TOKENS,
  ANSWER_MAX_PARAGRAPHS,
  buildConversationalAnswerMessages,
  runConversationalAnswer,
} from "../../src/lib/agent/answer/runtime";
import type { ModelConfig } from "../../src/lib/agent/llm/model-config";
import { orchestratorPlanToIntent } from "../../src/lib/agent/orchestration/orchestrator-plan-to-intent";
import type { AgentIntent } from "../../src/lib/agent/schemas";
import { createModelCallBudgetRecorder } from "../../src/lib/agent/orchestration/model-call-budget";

const answerIntent = (answer: string): AgentIntent => ({
  args: { answer },
  confidence: 0.9,
  intent: "answer_question",
  reply: answer,
});

const missingAnswerIntent = {
  args: { answer: "" },
  confidence: 0.9,
  intent: "answer_question",
} as AgentIntent;

const fakeModel = (
  chunks: Array<AIMessageChunk | Error>,
  options: { delayMs?: number; calls?: { value: number } } = {},
): BaseChatModel => ({
  stream: async () => {
    if (options.calls) options.calls.value += 1;
    return (async function* () {
      for (const chunk of chunks) {
        if (options.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (chunk instanceof Error) throw chunk;
        yield chunk;
      }
    })();
  },
}) as unknown as BaseChatModel;

test("maps a question-only orchestrator task to a missing-answer intent", () => {
  const intent = orchestratorPlanToIntent({
    mode: "single",
    reasoning: "咨询",
    source: "llm",
    tasks: [{
      agentRole: "query",
      args: { question: "什么是零信任？" },
      dependsOn: [],
      id: "t1",
      intent: "answer_question",
      label: "回答问题",
    }],
  });

  assert.equal(intent?.intent, "answer_question");
  if (intent?.intent === "answer_question") {
    assert.equal(intent.args.answer, "");
    assert.equal(intent.args.openDomainTopic, "什么是零信任？");
  }
});

test("canonical consultation maps to the one-call Answer role", async () => {
  const recorder = createModelCallBudgetRecorder();
  const intent = orchestratorPlanToIntent({
    mode: "single",
    reasoning: "咨询",
    source: "llm",
    tasks: [{
      agentRole: "query",
      args: { question: "什么是零信任？" },
      dependsOn: [],
      id: "t1",
      intent: "answer_question",
      label: "回答问题",
    }],
  });
  assert.equal(intent?.intent, "answer_question");
  if (!intent || intent.intent !== "answer_question") return;

  const result = await runConversationalAnswer({
    callScopeId: "cons-1:1",
    intent,
    message: "什么是零信任？",
    modelCallRecorder: recorder,
    model: fakeModel([
      new AIMessageChunk({ content: "零信任强调持续验证。" }),
    ]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.equal(result.status, "complete");
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.answerLogicalCalls, 1);
  assert.equal(snapshot.answerProviderAttempts, 1);
  assert.equal(snapshot.unexpectedDuplicateModelCalls, 0);
});

test("reuses a complete orchestrator answer with zero model calls", async () => {
  const emitted: string[] = [];
  const calls = { value: 0 };

  const result = await runConversationalAnswer({
    emitToken: (value) => emitted.push(value),
    intent: answerIntent("直接复用现有回答。"),
    message: "请回答",
    model: fakeModel([], { calls }),
  });

  assert.deepEqual(result, {
    answer: "直接复用现有回答。",
    persist: true,
    status: "complete",
  });
  assert.equal(calls.value, 0);
  assert.deepEqual(emitted, ["直接复用现有回答。"]);
});

test("uses one model call when the orchestrator answer is missing", async () => {
  const emitted: string[] = [];
  const calls = { value: 0 };
  const recorder = createModelCallBudgetRecorder();
  const result = await runConversationalAnswer({
    emitToken: (value) => emitted.push(value),
    intent: missingAnswerIntent,
    message: "什么是零信任？",
    modelCallRecorder: recorder,
    model: fakeModel([
      new AIMessageChunk({ content: "零信任强调持续验证" }),
      new AIMessageChunk({ content: "，不默认信任任何请求。" }),
    ], { calls }),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  const snapshot = recorder.snapshot();
  assert.equal(calls.value, 1);
  assert.equal(snapshot.answerLogicalCalls, 1);
  assert.equal(snapshot.answerProviderAttempts, 1);
  assert.equal(snapshot.orchestratorLogicalCalls, 0);
  assert.equal(snapshot.unexpectedDuplicateModelCalls, 0);
  assert.deepEqual(emitted, ["零信任强调持续验证", "，不默认信任任何请求。"]);
  assert.deepEqual(result, {
    answer: "零信任强调持续验证，不默认信任任何请求。",
    persist: true,
    status: "complete",
  });
});

test("applies the fixed output budget only when constructing the answer model", async () => {
  const receivedConfig = { value: null as ModelConfig | null };
  const modelConfig: ModelConfig = {
    apiKey: "test-only",
    baseURL: "https://example.invalid",
    maxRetries: 0,
    model: "fake",
    provider: "deepseek",
    structuredOutputMode: "provider_default",
    temperature: 0.1,
    timeoutMs: 30_000,
  };

  const result = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "解释零信任",
    modelConfig,
    modelFactory: (config) => {
      receivedConfig.value = config;
      return fakeModel([new AIMessageChunk({ content: "简短回答" })]);
    },
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.equal(result.status, "complete");
  assert.equal(ANSWER_MAX_OUTPUT_TOKENS, 384);
  assert.equal(ANSWER_MAX_PARAGRAPHS, 4);
  assert.equal(receivedConfig.value?.maxOutputTokens, 384);
  assert.equal(modelConfig.maxOutputTokens, undefined);
  assert.match(
    buildConversationalAnswerMessages({ message: "解释零信任" })[0]?.content ?? "",
    /no more than four short paragraphs/i,
  );
});

test("ignores reasoning blocks and continues with text", async () => {
  const emitted: string[] = [];
  const result = await runConversationalAnswer({
    emitToken: (value) => emitted.push(value),
    intent: missingAnswerIntent,
    message: "解释概念",
    model: fakeModel([
      new AIMessageChunk({ content: [{ type: "reasoning", reasoning: "hidden" } as never] }),
      new AIMessageChunk({ content: [{ type: "text", text: "可见回答" }] }),
    ]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.equal(result.status, "complete");
  assert.deepEqual(emitted, ["可见回答"]);
});

test("maps tool calls before and after text to unavailable and incomplete", async () => {
  const toolChunk = new AIMessageChunk({
    content: "",
    tool_call_chunks: [{ args: "{}", id: "1", index: 0, name: "execute" }],
  });
  const before = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([toolChunk]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const emitted: string[] = [];
  const after = await runConversationalAnswer({
    emitToken: (value) => emitted.push(value),
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new AIMessageChunk({ content: "部分" }), toolChunk, new AIMessageChunk({ content: "不得继续" })]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.deepEqual(before, { errorCode: "tool_call", persist: false, status: "unavailable" });
  assert.deepEqual(after, { errorCode: "tool_call", partialOutputEmitted: true, persist: false, status: "incomplete" });
  assert.deepEqual(emitted, ["部分"]);
});

test("rejects unknown content blocks before and after emitted text", async () => {
  const invalid = new AIMessageChunk({ content: [{ type: "image", source_type: "url", url: "https://example.invalid/x" } as never] });
  const before = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([invalid]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const after = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new AIMessageChunk({ content: "部分" }), invalid]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.equal(before.status, "unavailable");
  assert.equal(before.errorCode, "invalid_block");
  assert.equal(after.status, "incomplete");
  assert.equal(after.errorCode, "invalid_block");
});

test("classifies provider errors before and after text without persisting partial output", async () => {
  const before = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new Error("provider secret")]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const after = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new AIMessageChunk({ content: "部分" }), new Error("provider secret")]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.deepEqual(before, { errorCode: "provider_error", persist: false, status: "unavailable" });
  assert.deepEqual(after, { errorCode: "provider_error", partialOutputEmitted: true, persist: false, status: "incomplete" });
});

test("enforces first-token and total timeouts", async () => {
  const first = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new AIMessageChunk({ content: "太晚" })], { delayMs: 20 }),
    timeouts: { firstTokenMs: 5, totalMs: 100 },
  });
  const total = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([
      new AIMessageChunk({ content: "先输出" }),
      new AIMessageChunk({ content: "太晚" }),
    ], { delayMs: 12 }),
    timeouts: { firstTokenMs: 30, totalMs: 18 },
  });

  assert.equal(first.status, "unavailable");
  assert.equal(first.errorCode, "first_token_timeout");
  assert.equal(total.status, "incomplete");
  assert.equal(total.errorCode, "total_timeout");
});

test("handles cancellation before and after partial output", async () => {
  const beforeController = new AbortController();
  beforeController.abort();
  const before = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([]),
    signal: beforeController.signal,
  });
  const afterController = new AbortController();
  const after = await runConversationalAnswer({
    emitToken: () => afterController.abort(),
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([new AIMessageChunk({ content: "部分" }), new AIMessageChunk({ content: "不应接受" })]),
    signal: afterController.signal,
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.equal(before.status, "unavailable");
  assert.equal(before.errorCode, "cancelled");
  assert.equal(after.status, "incomplete");
  assert.equal(after.errorCode, "cancelled");
});

test("rejects empty final streams and output overflow", async () => {
  const empty = await runConversationalAnswer({
    intent: missingAnswerIntent,
    message: "回答",
    model: fakeModel([]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });
  const overflow = await runConversationalAnswer({
    intent: missingAnswerIntent,
    maxChars: 3,
    message: "回答",
    model: fakeModel([
      new AIMessageChunk({ content: "好" }),
      new AIMessageChunk({ content: "超过上限" }),
    ]),
    timeouts: { firstTokenMs: 100, totalMs: 200 },
  });

  assert.deepEqual(empty, { errorCode: "empty_stream", persist: false, status: "unavailable" });
  assert.deepEqual(overflow, { errorCode: "overflow", partialOutputEmitted: true, persist: false, status: "incomplete" });
});
