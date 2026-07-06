import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStreamBlock } from "../../src/lib/agent/chat-stream";
import { createAgentChatStream } from "../../src/lib/agent/chat-pipeline/stream-envelope";
import { buildLangGraphFailureResponse } from "../../src/lib/agent/langgraph/failure-response";
import { readAgentChatStream } from "../../src/lib/agent/read-agent-chat-stream";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "../../src/lib/agent/stream-events";
import type {
  AgentChatResponse,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "../../src/lib/agent/schemas";
import type { AgentTraceEventPayload } from "../../src/lib/agent/trace";

const encodeBlock = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const createStreamResponse = (blocks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        for (const block of blocks) {
          controller.enqueue(encoder.encode(block));
        }

        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    },
  );

test("parseStreamBlock parses structured stage, progress, and change events", () => {
  const parsedStage = parseStreamBlock(
    encodeBlock("stage", {
      id: "stage-context",
      phase: "context",
      startedAt: "2026-06-06T00:00:00.000Z",
      status: "running",
      title: "构建上下文",
    }),
  );
  const parsedProgress = parseStreamBlock(
    encodeBlock("progress", {
      detail: "最近 3 条消息已载入",
      message: "正在整理会话上下文",
      stageId: "stage-context",
    }),
  );
  const parsedChange = parseStreamBlock(
    encodeBlock("change", {
      collections: ["plans"],
      riskLevel: "medium",
      stageId: "stage-dry-run",
      summary: "将创建 1 个计划草稿",
    }),
  );

  assert.equal(parsedStage?.event, "stage");
  assert.equal((parsedStage?.data as AgentStreamStageEvent).phase, "context");
  assert.equal(parsedProgress?.event, "progress");
  assert.equal((parsedProgress?.data as AgentStreamProgressEvent).message, "正在整理会话上下文");
  assert.equal(parsedChange?.event, "change");
  assert.deepEqual((parsedChange?.data as AgentStreamChangeEvent).collections, ["plans"]);
});

test("readAgentChatStream routes stream stage events without mixing progress into the final answer", async () => {
  const stages: AgentStreamStageEvent[] = [];
  const progress: AgentStreamProgressEvent[] = [];
  const changes: AgentStreamChangeEvent[] = [];
  const assistantTokens: string[] = [];
  const thinkingTokens: string[] = [];
  const traceSteps: AgentTraceStep[] = [];
  const tokenUsages: AgentTokenUsage[] = [];
  const donePayloads: Array<Partial<AgentChatResponse> & { assistantMessage?: string }> = [];

  const response = createStreamResponse([
    encodeBlock("stage", {
      id: "stage-context",
      phase: "context",
      startedAt: "2026-06-06T00:00:00.000Z",
      status: "running",
      title: "构建上下文",
    } satisfies AgentStreamStageEvent),
    encodeBlock("progress", {
      detail: "会话摘要已生成",
      message: "读取最近消息",
      stageId: "stage-context",
    } satisfies AgentStreamProgressEvent),
    encodeBlock("change", {
      collections: ["plans"],
      riskLevel: "medium",
      stageId: "stage-dry-run",
      summary: "预览创建计划",
    } satisfies AgentStreamChangeEvent),
    encodeBlock("token", {
      block: "thinking",
      content: "内部进度不应进入最终回复",
    }),
    encodeBlock("token", {
      block: "response",
      content: "这是答案",
      tokenUsage: {
        contextTokens: 1,
        inputTokens: 1,
        outputTokens: 1,
        source: "estimate",
        totalTokens: 3,
      },
    }),
    encodeBlock("done", {
      assistantMessage: "这是答案",
      engine: "workflow",
      intent: "answer_question",
      pendingAction: null,
    }),
  ]);

  await readAgentChatStream(response, {
    appendAssistantToken: (content) => assistantTokens.push(content),
    onChange: (event) => changes.push(event),
    onDone: (payload) => {
      donePayloads.push(payload);
    },
    onErrorMessage: () => undefined,
    onMeta: () => undefined,
    onProgress: (event) => progress.push(event),
    onStage: (event) => stages.push(event),
    onStatus: () => undefined,
    onStreamStart: () => undefined,
    onThinkingToken: (content) => thinkingTokens.push(content),
    onTokenUsage: (usage) => tokenUsages.push(usage),
    onTraceStep: (step) => traceSteps.push(step),
    replaceAssistantContent: () => undefined,
    setStreamingState: () => undefined,
  });

  assert.equal(stages.length, 1);
  assert.equal(stages[0].title, "构建上下文");
  assert.equal(progress[0].message, "读取最近消息");
  assert.equal(changes[0].summary, "预览创建计划");
  assert.deepEqual(assistantTokens, ["这是答案"]);
  assert.deepEqual(thinkingTokens, ["内部进度不应进入最终回复"]);
  assert.equal(donePayloads[0]?.assistantMessage, "这是答案");
  assert.equal(traceSteps.length, 0);
  assert.equal(tokenUsages.length, 1);
});

test("readAgentChatStream routes realtime backend activity events", async () => {
  const activityEvents: AgentTraceEventPayload[] = [];
  const response = createStreamResponse([
    encodeBlock("activity", {
      createdAt: "2026-07-05T00:00:00.000Z",
      inputPreview: {
        authorization: "Bearer should-not-render",
      },
      intent: "query_schedule",
      phase: "api_call",
      status: "started",
      summary: "正在查询本地日程",
      threadId: "thread-activity",
      title: "正在查询本地日程",
    } satisfies AgentTraceEventPayload),
    encodeBlock("done", {
      assistantMessage: "完成",
      engine: "workflow",
      intent: "query_schedule",
      pendingAction: null,
    }),
  ]);

  await readAgentChatStream(response, {
    appendAssistantToken: () => undefined,
    onBackendTraceEvent: (event) => activityEvents.push(event),
    onDone: () => undefined,
    onErrorMessage: () => undefined,
    onMeta: () => undefined,
    onStatus: () => undefined,
    onStreamStart: () => undefined,
    onThinkingToken: () => undefined,
    onTokenUsage: () => undefined,
    onTraceStep: () => undefined,
    replaceAssistantContent: () => undefined,
    setStreamingState: () => undefined,
  });

  assert.equal(activityEvents.length, 1);
  assert.equal(activityEvents[0].phase, "api_call");
  assert.equal(activityEvents[0].intent, "query_schedule");
  assert.deepEqual(activityEvents[0].inputPreview, {
    authorization: "[redacted]",
  });
});

test("createAgentChatStream exposes stage, progress, and change events from the runner", async () => {
  const response = createAgentChatStream(async (_status, _trace, _usage, _token, emitStage, emitProgress, emitChange) => {
    emitStage({
      id: "stage-arbitration",
      phase: "arbitration",
      startedAt: "2026-06-06T00:00:00.000Z",
      status: "running",
      title: "意图仲裁",
    });
    emitProgress({
      detail: "route=answer",
      message: "仲裁结果：直接回答",
      stageId: "stage-arbitration",
    });
    emitChange({
      collections: ["plans"],
      riskLevel: "low",
      stageId: "stage-dry-run",
      summary: "预览低风险更新",
    });

    return {
      assistantMessage: "完成",
      engine: "workflow",
      intent: "answer_question",
      pendingAction: null,
    };
  });

  const body = await response.text();

  assert.match(body, /event: stage\ndata: .*"phase":"arbitration"/);
  assert.match(body, /event: progress\ndata: .*"message":"仲裁结果：直接回答"/);
  assert.match(body, /event: change\ndata: .*"summary":"预览低风险更新"/);
  assert.match(body, /event: done\ndata: .*"assistantMessage":"完成"/);
});

test("createAgentChatStream emits realtime backend activity events from the runner", async () => {
  const response = createAgentChatStream(async (
    _status,
    _trace,
    _usage,
    _token,
    _emitStage,
    _emitProgress,
    _emitChange,
    emitActivity,
  ) => {
    emitActivity({
      createdAt: "2026-07-05T00:00:00.000Z",
      intent: "create_schedule_items",
      phase: "dry_run",
      status: "started",
      summary: "正在 dry-run",
      threadId: "thread-stream-activity",
      title: "正在 dry-run",
    });

    return {
      assistantMessage: "完成",
      engine: "workflow",
      intent: "create_schedule_items",
      pendingAction: null,
    };
  });

  const body = await response.text();

  assert.match(body, /event: activity\ndata: .*"phase":"dry_run"/);
  assert.match(body, /event: activity\ndata: .*"status":"started"/);
  assert.match(body, /event: done\ndata: .*"assistantMessage":"完成"/);
});

test("createAgentChatStream preserves pending actions in controlled LangGraph failures", async () => {
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
  const response = createAgentChatStream(async () =>
    buildLangGraphFailureResponse({
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
    }),
  );

  const body = await response.text();

  assert.match(body, /event: meta\ndata: .*"id":"pending-action"/);
  assert.match(body, /event: done\ndata: .*"id":"pending-action"/);
  assert.doesNotMatch(body, /event: error/);
});

test("createAgentChatStream includes turnId in meta and done", async () => {
  const response = createAgentChatStream(async () => ({
    assistantMessage: "完成",
    engine: "workflow",
    intent: "answer_question",
    pendingAction: null,
    threadId: 42,
    turnId: "turn-stream-1",
  }));

  const body = await response.text();

  assert.match(
    body,
    /event: meta\ndata: .*"turnId":"turn-stream-1"/,
  );
  assert.match(
    body,
    /event: done\ndata: .*"turnId":"turn-stream-1"/,
  );
});
