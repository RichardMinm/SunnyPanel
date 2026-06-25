import assert from "node:assert/strict";
import test from "node:test";

import { buildLangGraphFailureResponse } from "../../src/lib/agent/langgraph/failure-response";
import type { PendingAction } from "../../src/lib/agent/schemas";

test("LangGraph failures become a readable clarify response", () => {
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
  const response = buildLangGraphFailureResponse({
    baseTokenUsage: {
      contextTokens: 2,
      inputTokens: 3,
      outputTokens: 0,
      source: "estimate",
      totalTokens: 5,
    },
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
  assert.match(response.assistantMessage, /LangGraph.*失败/);
  assert.match(response.assistantMessage, /没有自动重试/);
  assert.equal(response.trace?.[0]?.status, "error");
});
