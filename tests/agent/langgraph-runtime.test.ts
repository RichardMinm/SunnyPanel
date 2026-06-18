import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgentGraphRuntimeConfig,
  isLangGraphIntentEnabled,
} from "../../src/lib/agent/langgraph/config.ts";
import {
  runSunnyAgentGraph,
  UnsupportedLangGraphIntentError,
} from "../../src/lib/agent/langgraph/runtime.ts";
import type { AgentChatResponse, AgentIntent } from "../../src/lib/agent/schemas.ts";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 2,
  inputTokens: 3,
  outputTokens: 0,
  source: "estimate",
  totalTokens: 5,
};

test("graph runtime config defaults to legacy and the Phase 1 read allowlist", () => {
  const config = getAgentGraphRuntimeConfig({});

  assert.equal(config.mode, "legacy");
  assert.deepEqual([...config.intents], [
    "answer_question",
    "query_progress",
    "query_plan_progress",
  ]);
  assert.equal(isLangGraphIntentEnabled("query_progress", config), true);
  assert.equal(isLangGraphIntentEnabled("create_plan", config), false);
});

test("graph runtime config reads hybrid mode and a normalized intent allowlist", () => {
  const config = getAgentGraphRuntimeConfig({
    AGENT_GRAPH_RUNTIME: "hybrid",
    AGENT_LANGGRAPH_INTENTS: " query_progress,answer_question,query_progress ",
  });

  assert.equal(config.mode, "hybrid");
  assert.deepEqual([...config.intents], ["query_progress", "answer_question"]);
});

test("Phase 1 graph runs buildContext, resolveIntent, executeRead, finalize in order", async () => {
  const order: string[] = [];
  const intent: AgentIntent = {
    args: { scope: "all" },
    confidence: 0.91,
    intent: "query_progress",
  };

  const response = await runSunnyAgentGraph(
    {
      baseTokenUsage: tokenUsage,
      message: "总结整体进度",
      pendingAction: null,
      resolvedHistory: [],
      threadId: 42,
      userId: 7,
    },
    {
      buildContext: async () => {
        order.push("buildContext");
        return {
          context: { mode: "review" },
          contextSummary: "已加载整体进度",
          tokenUsage,
        };
      },
      executeRead: async ({ resolution }) => {
        order.push("executeRead");
        assert.equal(resolution.intent.intent, "query_progress");
        return {
          assistantMessage: "整体进度正常。",
          pendingAction: null,
        };
      },
      finalize: async ({ response: graphResponse }) => {
        order.push("finalize");
        return { ...graphResponse, threadId: 42 };
      },
      resolveIntent: async () => {
        order.push("resolveIntent");
        return { engine: "heuristic", intent };
      },
    },
  );

  assert.deepEqual(order, [
    "buildContext",
    "resolveIntent",
    "executeRead",
    "finalize",
  ]);
  assert.equal(response.assistantMessage, "整体进度正常。");
  assert.equal(response.intent, "query_progress");
  assert.equal(response.contextSummary, "已加载整体进度");
  assert.equal(response.threadId, 42);
});

test("an unsupported intent stops before executeRead and finalize", async () => {
  let executeCount = 0;
  let finalizeCount = 0;

  await assert.rejects(
    runSunnyAgentGraph(
      {
        baseTokenUsage: tokenUsage,
        message: "创建计划",
        pendingAction: null,
        resolvedHistory: [],
        threadId: 42,
        userId: 7,
      },
      {
        buildContext: async () => ({
          context: {},
          contextSummary: "上下文",
          tokenUsage,
        }),
        executeRead: async () => {
          executeCount += 1;
          return { assistantMessage: "不应执行", pendingAction: null };
        },
        finalize: async ({ response }) => {
          finalizeCount += 1;
          return response;
        },
        resolveIntent: async () => ({
          engine: "heuristic",
          intent: {
            args: { title: "测试计划" },
            confidence: 1,
            intent: "create_plan",
          },
        }),
      },
    ),
    UnsupportedLangGraphIntentError,
  );

  assert.equal(executeCount, 0);
  assert.equal(finalizeCount, 0);
});
