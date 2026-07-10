import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildLangGraphFailureResponse } from "../../src/lib/agent/langgraph/failure-response";
import type { PendingAction } from "../../src/lib/agent/schemas";

const read = (path: string) => readFileSync(path, "utf8");

const baseTokenUsage = {
  contextTokens: 2,
  inputTokens: 3,
  outputTokens: 0,
  source: "estimate" as const,
  totalTokens: 5,
};

const pendingAction: PendingAction = {
  action: {
    args: { title: "待确认计划" },
    changes: [],
    id: "pending-action",
    intent: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    summary: "创建待确认计划",
  },
  type: "await_confirmation",
};

/* ── D0-BLOCKER-1: User-safe failure message ── */

test("LangGraph failure response returns user-safe message (no internal architecture)", () => {
  const response = buildLangGraphFailureResponse({
    baseTokenUsage,
    error: new Error("checkpoint unavailable"),
    pendingAction,
    threadId: 42,
    workbenchMode: "ask",
  });

  assert.equal(response.intent, "clarify");
  assert.equal(response.engine, "workflow");
  assert.deepEqual(response.pendingAction, pendingAction);
  assert.equal(response.threadId, 42);
  assert.equal(response.workbenchMode, "ask");

  // User-facing message must be safe — no internal architecture details
  assert.match(response.assistantMessage, /处理请求时遇到问题/);
  assert.match(response.assistantMessage, /会话状态已保留/);

  // Banned words in user-facing message
  assert.doesNotMatch(response.assistantMessage, /LangGraph/);
  assert.doesNotMatch(response.assistantMessage, /AGENT_GRAPH_RUNTIME/);
  assert.doesNotMatch(response.assistantMessage, /legacy/);
  assert.doesNotMatch(response.assistantMessage, /旧管线/);
  assert.doesNotMatch(response.assistantMessage, /自动重试/);
  assert.doesNotMatch(response.assistantMessage, /写入期间状态不确定/);
});

test("LangGraph failure response preserves pending action (write path safety)", () => {
  // Even when the graph fails, the pending action must be preserved
  // so the user can retry after the issue is resolved
  const response = buildLangGraphFailureResponse({
    baseTokenUsage,
    error: new Error("node crash"),
    pendingAction,
    threadId: 42,
  });

  assert.deepEqual(response.pendingAction, pendingAction);
  assert.equal(response.intent, "clarify");
  // No pendingAction leak: it's still available but the response is clarify
  assert.ok(response.assistantMessage.length > 0);
});

test("LangGraph failure response records technical details in trace (not user message)", () => {
  const error = new Error("Postgres checkpoint connection refused at 10.0.1.5:5432");
  const response = buildLangGraphFailureResponse({
    baseTokenUsage,
    error,
    pendingAction: null,
    threadId: 1,
  });

  // Trace records the technical error for developer observability
  assert.ok(response.trace);
  assert.equal(response.trace[0]?.status, "error");
  assert.equal(response.trace[0]?.id, "langgraph-runtime-failure");
  assert.match(response.trace[0]?.detail ?? "", /checkpoint/);

  // But the user-facing message must NOT contain the technical error
  assert.doesNotMatch(response.assistantMessage, /checkpoint/);
  assert.doesNotMatch(response.assistantMessage, /Postgres/);
  assert.doesNotMatch(response.assistantMessage, /10\.0\.1\.5/);
  assert.doesNotMatch(response.assistantMessage, /connection refused/);

  // Trace title is developer-safe (no raw secrets, no env var advice for users)
  assert.match(response.trace[0]?.title ?? "", /已脱敏记录/);
});

test("LangGraph failure response without pending action returns null pendingAction", () => {
  const response = buildLangGraphFailureResponse({
    baseTokenUsage,
    error: new Error("build_context timeout"),
    pendingAction: null,
    threadId: 7,
  });

  assert.equal(response.pendingAction, null);
  assert.match(response.assistantMessage, /处理请求时遇到问题/);
});

/* ── D0-BLOCKER-1: Source-level banned words audit ── */

test("failure-response.ts source does not contain banned words in user message", () => {
  const source = read("src/lib/agent/langgraph/failure-response.ts");

  // The USER_FAILURE_MESSAGE constant must not contain internal architecture terms
  assert.doesNotMatch(source, /LangGraph.*失败/);
  assert.doesNotMatch(source, /没有回退旧管线/);
  assert.doesNotMatch(source, /AGENT_GRAPH_RUNTIME/);
  assert.doesNotMatch(source, /自动重试写操作/);
  assert.doesNotMatch(source, /写入期间状态不确定/);

  // The function must still exist and be importable
  assert.ok(source.includes("buildLangGraphFailureResponse"));
  assert.ok(source.includes("USER_FAILURE_MESSAGE"));
});

test("handle-agent-chat-post.ts legacy fallback message is also user-safe", () => {
  const source = read("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");

  // The legacy mode failure message must also be clean
  assert.doesNotMatch(source, /Agent 运行失败.*没有自动重试/);
  assert.doesNotMatch(source, /请检查最近的 AgentRun/);
  assert.match(source, /会话状态已保留，请稍后重试/);
});

/* ── D0-BLOCKER-1: No retired heuristic reintroduction ── */

test("retired-intent-response.ts is still retired (no definition Q&A re-enabled)", () => {
  const source = read("src/lib/agent/intent/retired-intent-response.ts");

  // parseDefinitionQuestionIntent must remain a noop stub
  assert.match(source, /parseDefinitionQuestionIntent.*=>.*null/);
  // No regex-based definition answering
  assert.doesNotMatch(source, /什么是/);
  assert.doesNotMatch(source, /网络安全/);
});

/* ── D0-BLOCKER-1: LLM unavailable guard in orchestration step ── */

test("LLM unavailable guard exists in orchestration step before LLM call", () => {
  const source = read("src/lib/agent/chat-pipeline/orchestration-step.ts");

  assert.ok(source.includes("isAgentLLMDisabled"));
  assert.ok(source.includes("getAgentModelConfig"));
  // The guard message must be user-safe
  assert.match(source, /AI 服务暂时不可用/);
  assert.match(source, /会话状态已保留/);
  // No internal architecture in the guard message
  assert.doesNotMatch(source, /LangGraph 运行失败/);
  assert.doesNotMatch(source, /AGENT_GRAPH_RUNTIME/);
});
