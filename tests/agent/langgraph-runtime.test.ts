import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgentGraphRuntimeConfig,
} from "../../src/lib/agent/langgraph/config";
import {
  runSunnyAgentGraph,
} from "../../src/lib/agent/langgraph/runtime";
import type { AgentChatResponse, AgentIntent } from "../../src/lib/agent/schemas";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 2,
  inputTokens: 3,
  outputTokens: 0,
  source: "estimate",
  totalTokens: 5,
};

test("graph runtime config defaults to LangGraph", () => {
  const config = getAgentGraphRuntimeConfig({});

  assert.deepEqual(config, { mode: "langgraph" });
});

test("graph runtime config keeps legacy as the only explicit fallback", () => {
  assert.deepEqual(
    getAgentGraphRuntimeConfig({ AGENT_GRAPH_RUNTIME: "legacy" }),
    { mode: "legacy" },
  );

  assert.deepEqual(
    getAgentGraphRuntimeConfig({ AGENT_GRAPH_RUNTIME: "hybrid" }),
    { mode: "langgraph" },
  );
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
      structuredConfirmation: null,
      threadId: 42,
      turnId: "turn-runtime-basic-1",
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

test("all registered intents can reach execution without an allowlist", async () => {
  let executeCount = 0;
  let finalizeCount = 0;

  const response = await runSunnyAgentGraph(
    {
      baseTokenUsage: tokenUsage,
      message: "创建计划",
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      threadId: 42,
      turnId: "turn-runtime-basic-2",
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
        return {
          assistantMessage: "创建计划预览",
          pendingAction: null,
        };
      },
      finalize: async ({ response: graphResponse }) => {
        finalizeCount += 1;
        return graphResponse;
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
  );

  assert.equal(response.intent, "create_plan");
  assert.equal(executeCount, 1);
  assert.equal(finalizeCount, 1);
});
