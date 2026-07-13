import assert from "node:assert/strict";
import test from "node:test";

import {
  claimAgentTurn,
  ensureLegacyThreadEvents,
  hydrateAgentThreadState,
  projectAgentThreadFromEvents,
  type AgentThreadEventRecord,
  type AgentThreadEventStore,
} from "../../src/lib/agent/thread-events";
import type {
  AgentChatResponse,
  PendingAction,
} from "../../src/lib/agent/schemas";

const response = (
  overrides: Partial<AgentChatResponse> = {},
): AgentChatResponse => ({
  assistantMessage: "完成",
  engine: "workflow",
  intent: "answer_question",
  pendingAction: null,
  threadId: 42,
  tokenUsage: {
    contextTokens: 1,
    inputTokens: 1,
    outputTokens: 1,
    source: "estimate",
    totalTokens: 3,
  },
  turnId: "turn-1",
  ...overrides,
});

const createMemoryStore = () => {
  const events: AgentThreadEventRecord[] = [];
  let nextId = 1;
  const store: AgentThreadEventStore = {
    append: async (input) => {
      if (events.some((event) => event.eventKey === input.eventKey)) {
        throw new Error("duplicate event key");
      }

      const event = { ...input, id: nextId };
      nextId += 1;
      events.push(event);

      return event;
    },
    findByEventKey: async (eventKey) =>
      events.find((event) => event.eventKey === eventKey) ?? null,
    listByThread: async (threadId) =>
      events.filter((event) => event.threadId === threadId),
    listByTurn: async (threadId, turnId) =>
      events.filter(
        (event) =>
          event.threadId === threadId &&
          event.turnId === turnId,
      ),
  };

  return { events, store };
};

test("turn claim blocks an in-flight duplicate and replays a terminal response", async () => {
  const { store } = createMemoryStore();
  const first = await claimAgentTurn({
    message: "总结进度",
    store,
    threadId: 42,
    turnId: "turn-1",
    userId: 7,
  });
  const duplicate = await claimAgentTurn({
    message: "总结进度",
    store,
    threadId: 42,
    turnId: "turn-1",
    userId: 7,
  });

  assert.equal(first.status, "claimed");
  assert.equal(duplicate.status, "blocked");

  await store.append({
    eventKey: "turn:turn-1:assistant",
    eventType: "assistant_completed",
    payload: {
      pendingAfter: null,
      response: response(),
    },
    recordedAt: "2026-06-23T01:00:01.000Z",
    schemaVersion: 1,
    threadId: 42,
    turnId: "turn-1",
    userId: 7,
  });

  const replay = await claimAgentTurn({
    message: "总结进度",
    store,
    threadId: 42,
    turnId: "turn-1",
    userId: 7,
  });

  assert.equal(replay.status, "replay");
  if (replay.status === "replay") {
    assert.equal(replay.response.assistantMessage, "完成");
  }
});

test("the same turnId is isolated between threads", async () => {
  const { store } = createMemoryStore();
  const first = await claimAgentTurn({
    message: "线程一",
    store,
    threadId: 41,
    turnId: "shared-turn",
    userId: 7,
  });
  const second = await claimAgentTurn({
    message: "线程二",
    store,
    threadId: 42,
    turnId: "shared-turn",
    userId: 7,
  });

  assert.equal(first.status, "claimed");
  assert.equal(second.status, "claimed");
});

test("turn claim records suggestion source metadata on the user event", async () => {
  const { events, store } = createMemoryStore();

  await claimAgentTurn({
    message: "复盘逾期计划",
    store,
    suggestionSource: {
      suggestedPrompt: "复盘逾期计划",
      suggestionId: 301,
    },
    threadId: 42,
    turnId: "turn-suggestion",
    userId: 7,
    workbenchMode: "plan",
  });

  assert.deepEqual(events[0]?.payload, {
    message: "复盘逾期计划",
    suggestionSource: {
      suggestedPrompt: "复盘逾期计划",
      suggestionId: 301,
    },
    workbenchMode: "plan",
  });
});

test("legacy bootstrap is idempotent and hydration continues from imported state", async () => {
  const { events, store } = createMemoryStore();
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "请补充计划标题",
    type: "await_clarification",
  };
  const legacyThread = {
    id: 42,
    lastConfidence: 0.8,
    lastEngine: "heuristic",
    lastIntent: "clarify",
    messages: [
      {
        content: "创建计划",
        recordedAt: "2026-06-22T23:59:00.000Z",
        role: "user",
      },
      {
        content: "请补充计划标题",
        recordedAt: "2026-06-22T23:59:01.000Z",
        role: "assistant",
      },
    ],
    pendingAction,
  };

  await ensureLegacyThreadEvents({
    store,
    thread: legacyThread,
    userId: 7,
  });
  await ensureLegacyThreadEvents({
    store,
    thread: legacyThread,
    userId: 7,
  });

  assert.equal(
    events.filter((event) => event.eventType === "legacy_bootstrap")
      .length,
    1,
  );

  await store.append({
    eventKey: "turn:turn-2:user",
    eventType: "user_received",
    payload: { message: "迁移计划", workbenchMode: "plan" },
    recordedAt: "2026-06-23T00:00:00.000Z",
    schemaVersion: 1,
    threadId: 42,
    turnId: "turn-2",
    userId: 7,
  });
  await store.append({
    eventKey: "turn:turn-2:assistant",
    eventType: "assistant_completed",
    payload: {
      pendingAfter: null,
      response: response({
        assistantMessage: "计划信息已补充",
        intent: "create_plan",
        turnId: "turn-2",
      }),
    },
    recordedAt: "2026-06-23T00:00:01.000Z",
    schemaVersion: 1,
    threadId: 42,
    turnId: "turn-2",
    userId: 7,
  });

  const state = await hydrateAgentThreadState({
    store,
    threadId: 42,
  });

  assert.deepEqual(
    state.messages.map((message) => [
      message.role,
      message.content,
    ]),
    [
      ["user", "创建计划"],
      ["assistant", "请补充计划标题"],
      ["user", "迁移计划"],
      ["assistant", "计划信息已补充"],
    ],
  );
  assert.equal(state.pendingAction, null);
  assert.equal(state.lastIntent, "create_plan");
});

test("projection failure preserves events and appends a projection_failed event", async () => {
  const { events, store } = createMemoryStore();
  await claimAgentTurn({
    message: "总结进度",
    store,
    threadId: 42,
    turnId: "turn-3",
    userId: 7,
  });
  await store.append({
    eventKey: "turn:turn-3:assistant",
    eventType: "assistant_completed",
    payload: {
      pendingAfter: null,
      response: response({ turnId: "turn-3" }),
    },
    recordedAt: "2026-06-23T00:01:01.000Z",
    schemaVersion: 1,
    threadId: 42,
    turnId: "turn-3",
    userId: 7,
  });

  const projected = await projectAgentThreadFromEvents({
    project: async () => {
      throw new Error("projection database unavailable");
    },
    store,
    threadId: 42,
    turnId: "turn-3",
    userId: 7,
  });

  assert.equal(projected.status, "failed");
  assert.equal(
    events.some(
      (event) => event.eventType === "projection_failed",
    ),
    true,
  );
  const state = await hydrateAgentThreadState({
    store,
    threadId: 42,
  });
  assert.equal(state.messages.at(-1)?.content, "完成");
});

test("a non-projecting failed event remains replayable without hydrating failed assistant output", async () => {
  const { store } = createMemoryStore();
  await store.append({ eventKey: "turn:failed:user", eventType: "user_received", payload: { message: "查询进展" }, recordedAt: "2026-07-13T08:00:00.000Z", schemaVersion: 1, threadId: 42, turnId: "failed", userId: 7 });
  await store.append({
    eventKey: "turn:failed:terminal", eventType: "turn_failed",
    payload: { error: "safe", pendingAfter: null, projectAssistantMessage: false, response: response({ assistantMessage: "不应进入消息", turnId: "failed" }) },
    recordedAt: "2026-07-13T08:00:01.000Z", schemaVersion: 1, threadId: 42, turnId: "failed", userId: 7,
  });
  const replay = await claimAgentTurn({ message: "查询进展", store, threadId: 42, turnId: "failed", userId: 7 });
  assert.equal(replay.status, "replay");
  const state = await hydrateAgentThreadState({ store, threadId: 42 });
  assert.deepEqual(state.messages, [{ content: "查询进展", role: "user" }]);
});
