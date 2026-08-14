import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStreamBlock } from "../../src/lib/agent/chat-stream";
import {
  createAgentChatResponse,
  createAgentChatStream,
} from "../../src/lib/agent/chat-pipeline/stream-envelope";
import { buildLangGraphFailureResponse } from "../../src/lib/agent/langgraph/failure-response";
import {
  hasServerInternalFailedAuditCompensation,
  markServerInternalFailedAuditCompensation,
} from "../../src/lib/agent/internal-rollback-evidence";
import { parsePublicAgentChatResponse } from "../../src/lib/agent/public-chat-response";
import { readAgentChatStream } from "../../src/lib/agent/read-agent-chat-stream";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
  AgentStreamTerminalEvent,
} from "../../src/lib/agent/stream-events";
import type {
  AgentChatResponse,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "../../src/lib/agent/schemas";
import type { AgentTraceEventPayload } from "../../src/lib/agent/trace";
import { QueryStreamFailure } from "../../src/lib/agent/query/errors";
import { ConversationalAnswerStreamFailure } from "../../src/lib/agent/answer/errors";
import { getScheduleCreationProposalFromAction } from "../../src/components/dashboard/agent/utils";

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

const unsafeRollbackTerminal = {
  affectedDocuments: [
    {
      collection: "plans",
      documentId: 42,
      extra: "must-not-cross",
      operation: "create",
      visibility: "private",
    },
    {
      collection: "users",
      documentId: 7,
      operation: "update",
      visibility: "private",
    },
  ],
  assistantMessage: "已创建计划",
  engine: "workflow",
  intent: "create_plan",
  lastRollbackPayload: {
    beforeSnapshot: { secret: "before" },
    strategy: "delete_created_document",
    target: { collection: "plans", documentId: 42 },
  },
  lastRollbackSourceRunId: 91,
  pendingAction: {
    action: {
      afterSnapshot: { secret: "after" },
      args: { title: "测试计划" },
      beforeSnapshot: { secret: "before" },
      changes: [
        {
          collection: "plans",
          operation: "create",
          preview: "创建测试计划",
        },
      ],
      id: "action-public-boundary",
      intent: "create_plan",
      riskLevel: "medium",
      rollbackPayload: {
        strategy: "delete_created_document",
        target: { collection: "plans", documentId: 42 },
      },
      summary: "创建测试计划",
    },
    type: "await_confirmation",
  },
} as unknown as AgentChatResponse;

const unsafeScheduleConfirmationTerminal = {
  assistantMessage: "请确认日程创建",
  engine: "workflow",
  intent: "create_schedule_items",
  pendingAction: {
    action: {
      affectedDocuments: [
        {
          collection: "schedule-items",
          documentId: 42,
          extra: "must-not-cross",
          operation: "create",
          visibility: "private",
        },
        {
          collection: "evil",
          documentId: -1,
          operation: "hack",
          visibility: "secret",
        },
      ],
      afterSnapshot: {
        conflictSuggestions: [
          {
            action: {
              date: "2026-07-30",
              endTime: "11:00",
              itemTitle: "发布检查",
              startTime: "10:00",
              type: "move_item",
            },
            description: "改到空闲时段",
            id: "move-release-check",
            label: "改到 10:00-11:00",
            riskLevel: "low",
          },
        ],
        conflictSummary: {
          conflictCount: 1,
          conflictPolicy: "ask",
          existingScheduleChecked: true,
          message: "发现 1 个时间冲突。",
          warningCount: 0,
        },
        dateRange: "2026-07-30",
        items: [
          {
            date: "2026-07-30",
            endTime: "10:00",
            startTime: "09:00",
            title: "发布检查",
          },
        ],
        scheduleConflicts: [
          {
            existingScheduleItemId: 501,
            existingTitle: "已有会议",
            message: "「发布检查」与已有会议冲突。",
            proposedDate: "2026-07-30",
            proposedEndTime: "10:00",
            proposedStartTime: "09:00",
            proposedTitle: "发布检查",
            severity: "warning",
            type: "existing",
          },
        ],
        sourceChecklistId: 12,
        sourcePlanId: 99,
        title: "发布日程",
      },
      args: {
        items: [
          {
            date: "2026-07-30",
            endTime: "10:00",
            startTime: "09:00",
            title: "发布检查",
          },
        ],
        sourceChecklistId: 12,
        sourcePlanId: 99,
        title: "发布日程",
      },
      beforeSnapshot: null,
      changes: [
        {
          collection: "schedule-items",
          operation: "create",
          preview: "创建 1 个日程项",
        },
      ],
      id: "schedule-confirmation-public-boundary",
      intent: "create_schedule_items",
      riskLevel: "medium",
      rollbackPayload: {
        strategy: "delete_created_documents",
        target: { collection: "schedule-items", documentIds: [42] },
      },
      summary: "创建发布日程",
    },
    type: "await_confirmation",
  },
} as unknown as AgentChatResponse;

const requireScheduleConfirmationAction = (
  response: null | Partial<AgentChatResponse>,
) => {
  assert.equal(response?.pendingAction?.type, "await_confirmation");
  const pendingAction = response?.pendingAction;
  assert.ok(pendingAction && pendingAction.type === "await_confirmation");

  return pendingAction.action;
};

test("JSON chat terminal strips executable rollback fields and sanitizes public effects", async () => {
  const response = createAgentChatResponse(unsafeRollbackTerminal, false);
  const body = await response.json() as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(body.lastRollbackSourceRunId, 91);
  assert.deepEqual(body.affectedDocuments, [
    {
      collection: "plans",
      documentId: 42,
      operation: "create",
      visibility: "private",
    },
  ]);
  assert.doesNotMatch(serialized, /lastRollbackPayload|rollbackPayload|beforeSnapshot|afterSnapshot|must-not-cross/);
});

test("public JSON and SSE projectors omit server-internal failed-audit compensation evidence", async () => {
  const internallyMarkedTerminal = markServerInternalFailedAuditCompensation({
    ...unsafeRollbackTerminal,
  });

  assert.equal(
    hasServerInternalFailedAuditCompensation(internallyMarkedTerminal),
    true,
  );

  const jsonResponse = createAgentChatResponse(internallyMarkedTerminal, false);
  const jsonBody = await jsonResponse.json();
  assert.equal(hasServerInternalFailedAuditCompensation(jsonBody), false);
  assert.doesNotMatch(
    JSON.stringify(jsonBody),
    /server-internal-failed-audit-compensation/,
  );

  const streamResponse = createAgentChatStream(
    async () => internallyMarkedTerminal,
  );
  const streamBody = await streamResponse.text();
  assert.doesNotMatch(
    streamBody,
    /server-internal-failed-audit-compensation/,
  );
});

test("SSE done terminal strips executable rollback fields and keeps only the bounded source ID", async () => {
  const response = createAgentChatStream(async () => unsafeRollbackTerminal);
  const body = await response.text();

  assert.match(body, /event: done\ndata: .*"lastRollbackSourceRunId":91/);
  assert.doesNotMatch(body, /lastRollbackPayload|rollbackPayload|beforeSnapshot|afterSnapshot|must-not-cross/);
});

test("stream response parser sanitizes done effects and rejects raw rollback fields and invalid source IDs", async () => {
  const donePayloads: Array<Record<string, unknown>> = [];
  const response = createStreamResponse([
    encodeBlock("done", {
      ...unsafeRollbackTerminal,
      lastRollbackSourceRunId: 1.5,
    }),
  ]);

  const result = await readAgentChatStream(response, {
    appendAssistantToken: () => undefined,
    onDone: (payload) => donePayloads.push(payload as Record<string, unknown>),
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

  assert.deepEqual(result?.affectedDocuments, [
    {
      collection: "plans",
      documentId: 42,
      operation: "create",
      visibility: "private",
    },
  ]);
  assert.equal((result as Record<string, unknown> | null)?.lastRollbackSourceRunId, undefined);
  assert.equal((result as Record<string, unknown> | null)?.lastRollbackPayload, undefined);
  assert.equal(donePayloads[0]?.lastRollbackPayload, undefined);
});

test("non-stream response parser applies the same bounded public contract", () => {
  const result = parsePublicAgentChatResponse({
    ...unsafeRollbackTerminal,
    affectedDocuments: [
      ...(unsafeRollbackTerminal.affectedDocuments ?? []),
      {
        collection: "plans",
        documentId: Number.MAX_SAFE_INTEGER + 1,
        operation: "create",
        visibility: "private",
      },
    ],
    lastRollbackSourceRunId: 92,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result?.lastRollbackSourceRunId, 92);
  assert.deepEqual(result?.affectedDocuments, [
    {
      collection: "plans",
      documentId: 42,
      operation: "create",
      visibility: "private",
    },
  ]);
  assert.doesNotMatch(
    serialized,
    /lastRollbackPayload|rollbackPayload|beforeSnapshot|afterSnapshot|must-not-cross/,
  );
});

test("JSON terminal preserves safe Schedule confirmation presentation and sanitizes nested effects", async () => {
  const response = createAgentChatResponse(unsafeScheduleConfirmationTerminal, false);
  const body = await response.json() as Partial<AgentChatResponse>;
  const action = requireScheduleConfirmationAction(body);
  const proposal = getScheduleCreationProposalFromAction(action);
  const serialized = JSON.stringify(body);

  assert.deepEqual(action.affectedDocuments, [
    {
      collection: "schedule-items",
      documentId: 42,
      operation: "create",
      visibility: "private",
    },
  ]);
  assert.equal(proposal?.itemCount, 1);
  assert.equal(proposal?.conflictSummary.conflictCount, 1);
  assert.equal(proposal?.conflicts[0]?.existingScheduleItemId, 501);
  assert.equal(proposal?.conflictSuggestions[0]?.id, "move-release-check");
  assert.doesNotMatch(
    serialized,
    /rollbackPayload|beforeSnapshot|afterSnapshot|must-not-cross|\"evil\"|\"hack\"|\"secret\"/,
  );
});

test("SSE parser preserves safe Schedule confirmation presentation and sanitizes nested effects", async () => {
  const response = createAgentChatStream(async () => unsafeScheduleConfirmationTerminal);
  const result = await readAgentChatStream(response, {
    appendAssistantToken: () => undefined,
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
  const action = requireScheduleConfirmationAction(result);
  const proposal = getScheduleCreationProposalFromAction(action);
  const serialized = JSON.stringify(result);

  assert.deepEqual(action.affectedDocuments, [
    {
      collection: "schedule-items",
      documentId: 42,
      operation: "create",
      visibility: "private",
    },
  ]);
  assert.equal(proposal?.itemCount, 1);
  assert.equal(proposal?.conflictSummary.message, "发现 1 个时间冲突。");
  assert.equal(proposal?.conflictSuggestions[0]?.label, "改到 10:00-11:00");
  assert.doesNotMatch(
    serialized,
    /rollbackPayload|beforeSnapshot|afterSnapshot|must-not-cross|\"evil\"|\"hack\"|\"secret\"/,
  );
});

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

test("QueryStreamFailure emits only a safe error terminal event", async () => {
  const response = createAgentChatStream(async () => {
    throw new QueryStreamFailure({ status: "partial", persist: false, partialOutputEmitted: true, errorCode: "provider_error", modelCalls: 1 });
  });
  const body = await response.text();
  assert.match(body, /event: error/);
  assert.match(body, /event: terminal\ndata: .*"status":"partial"/);
  assert.match(body, /Read-only query unavailable/);
  assert.doesNotMatch(body, /event: meta|event: done/);
});

test("ConversationalAnswerStreamFailure emits no meta or done after partial text", async () => {
  const response = createAgentChatStream(async () => {
    throw new ConversationalAnswerStreamFailure({
      errorCode: "tool_call",
      partialOutputEmitted: true,
      persist: false,
      status: "incomplete",
    });
  });
  const body = await response.text();

  assert.match(body, /event: error/);
  assert.match(body, /event: terminal\ndata: .*"status":"partial"/);
  assert.match(body, /Conversational answer unavailable/);
  assert.doesNotMatch(body, /event: meta|event: done/);
});

test("unknown stream failures expose only a safe unavailable terminal", async () => {
  const response = createAgentChatStream(async () => {
    throw new Error("provider response contained private diagnostic details");
  });
  const body = await response.text();

  assert.match(body, /event: error/);
  assert.match(body, /Agent stream unavailable/);
  assert.match(body, /event: terminal\ndata: .*"status":"unavailable"/);
  assert.doesNotMatch(body, /private diagnostic details/);
  assert.doesNotMatch(body, /event: meta|event: done/);
});

test("successful streams end with one complete product terminal", async () => {
  const response = createAgentChatStream(async () => ({
    assistantMessage: "完成",
    engine: "workflow",
    intent: "answer_question",
    pendingAction: null,
  }));
  const body = await response.text();

  assert.match(body, /event: done\ndata: .*"assistantMessage":"完成"/);
  assert.match(
    body,
    /event: terminal\ndata: \{"partialOutputEmitted":false,"persist":true,"retryable":false,"status":"complete"\}\n\n$/,
  );
  assert.equal(body.match(/event: terminal/g)?.length, 1);
});

test("stream parser keeps partial text but never promotes an error to done", async () => {
  const terminals: AgentStreamTerminalEvent[] = [];
  const donePayloads: unknown[] = [];
  const tokens: string[] = [];
  const response = createStreamResponse([
    encodeBlock("token", { block: "response", content: "部分回答" }),
    encodeBlock("error", {
      assistantMessage: "回答暂时不可用，请稍后重试。",
      message: "Conversational answer unavailable",
    }),
    encodeBlock("terminal", {
      partialOutputEmitted: true,
      persist: false,
      retryable: true,
      status: "partial",
    }),
  ]);

  const result = await readAgentChatStream(response, {
    appendAssistantToken: (token) => tokens.push(token),
    onDone: (payload) => donePayloads.push(payload),
    onErrorMessage: () => undefined,
    onMeta: () => undefined,
    onStatus: () => undefined,
    onStreamStart: () => undefined,
    onTerminal: (terminal) => terminals.push(terminal),
    onThinkingToken: () => undefined,
    onTokenUsage: () => undefined,
    onTraceStep: () => undefined,
    replaceAssistantContent: () => undefined,
    setStreamingState: () => undefined,
  });

  assert.equal(result, null);
  assert.deepEqual(tokens, ["部分回答"]);
  assert.equal(donePayloads.length, 0);
  assert.equal(terminals.at(-1)?.status, "partial");
});

test("stream parser safely infers unavailable when transport closes without a terminal", async () => {
  const terminals: AgentStreamTerminalEvent[] = [];
  const response = createStreamResponse([]);

  const result = await readAgentChatStream(response, {
    appendAssistantToken: () => undefined,
    onDone: () => undefined,
    onErrorMessage: () => undefined,
    onMeta: () => undefined,
    onStatus: () => undefined,
    onStreamStart: () => undefined,
    onTerminal: (terminal) => terminals.push(terminal),
    onThinkingToken: () => undefined,
    onTokenUsage: () => undefined,
    onTraceStep: () => undefined,
    replaceAssistantContent: () => undefined,
    setStreamingState: () => undefined,
  });

  assert.equal(result, null);
  assert.equal(terminals.at(-1)?.status, "unavailable");
  assert.equal(terminals.at(-1)?.persist, false);
});
