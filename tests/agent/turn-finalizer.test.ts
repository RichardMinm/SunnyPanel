import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentTurnFinalizer,
} from "../../src/lib/agent/turn-finalizer";
import type {
  AgentThreadEventRecord,
  AgentThreadEventStore,
} from "../../src/lib/agent/thread-events";
import type { AgentChatResponse } from "../../src/lib/agent/schemas";
import type { AgentThread } from "../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 2,
  inputTokens: 3,
  outputTokens: 1,
  source: "estimate",
  totalTokens: 6,
};

const createMemoryStore = () => {
  const events: AgentThreadEventRecord[] = [];
  const store: AgentThreadEventStore = {
    append: async (input) => {
      if (events.some((event) => event.eventKey === input.eventKey)) {
        throw new Error("duplicate event key");
      }

      const event = {
        ...structuredClone(input),
        id: events.length + 1,
      };
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

test("turn finalizer writes one terminal event and runs learning once", async () => {
  const { events, store } = createMemoryStore();
  let learningRuns = 0;
  let projections = 0;
  const thread = {
    id: 42,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  await store.append({
    eventKey: "turn:turn-finalize:user",
    eventType: "user_received",
    payload: { message: "总结进度" },
    recordedAt: "2026-06-23T01:00:00.000Z",
    schemaVersion: 1,
    threadId: 42,
    turnId: "turn-finalize",
    userId: 7,
  });
  const finalize = createAgentTurnFinalizer({
    eventStore: store,
    message: "总结进度",
    pendingBefore: null,
    project: async () => {
      projections += 1;
    },
    runLearningLoop: async () => {
      learningRuns += 1;
      return {
        candidates: [],
        decisions: [],
        savedMemories: [],
        source: "fallback",
        suggestedMemories: [],
      };
    },
    thread,
    turnId: "turn-finalize",
    user: { id: 7 },
    workbenchMode: "review",
  });
  const baseResponse: AgentChatResponse = {
    assistantMessage: "进度正常",
    confidence: 0.9,
    engine: "workflow",
    intent: "query_progress",
    pendingAction: null,
    tokenUsage,
  };

  const first = await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: baseResponse,
    tokenUsage,
  });
  const replay = await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: {
      ...baseResponse,
      assistantMessage: "不应覆盖已完成响应",
    },
    tokenUsage,
  });

  assert.equal(first.turnId, "turn-finalize");
  assert.equal(first.threadId, 42);
  assert.equal(first.workbenchMode, "review");
  assert.equal(replay.assistantMessage, "进度正常");
  assert.equal(
    events.filter(
      (event) => event.eventType === "assistant_completed",
    ).length,
    1,
  );
  assert.equal(learningRuns, 1);
  assert.equal(projections, 1);
});

test("turn finalizer persists the response after learning trace is complete", async () => {
  const { events, store } = createMemoryStore();
  const emittedTrace: NonNullable<AgentChatResponse["trace"]> = [];
  const thread = {
    id: 43,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  await store.append({
    eventKey: "turn:turn-learning-trace:user",
    eventType: "user_received",
    payload: { message: "总结进度" },
    recordedAt: "2026-06-23T01:00:00.000Z",
    schemaVersion: 1,
    threadId: 43,
    turnId: "turn-learning-trace",
    userId: 7,
  });
  const finalize = createAgentTurnFinalizer({
    eventStore: store,
    message: "总结进度",
    pendingBefore: null,
    project: async () => undefined,
    runLearningLoop: async ({ pushTrace }) => {
      pushTrace?.({
        detail: "学习完成",
        id: "learning-loop",
        kind: "complete",
        status: "done",
        title: "学习反馈",
      });

      return {
        candidates: [],
        decisions: [],
        savedMemories: [],
        source: "fallback",
        suggestedMemories: [],
      };
    },
    thread,
    turnId: "turn-learning-trace",
    user: { id: 7 },
  });

  const response = await finalize({
    existingMemories: [],
    pushTrace: (step) => emittedTrace.push(step),
    response: {
      assistantMessage: "进度正常",
      confidence: 0.9,
      engine: "workflow",
      intent: "query_progress",
      pendingAction: null,
      tokenUsage,
      trace: [],
    },
    tokenUsage,
  });
  const terminalEvent = events.find(
    (event) => event.eventType === "assistant_completed",
  );
  const persistedResponse = (
    terminalEvent?.payload as {
      response?: AgentChatResponse;
    }
  ).response;

  assert.equal(emittedTrace.at(-1)?.id, "learning-loop");
  assert.equal(response.trace?.at(-1)?.id, "learning-loop");
  assert.equal(persistedResponse?.trace?.at(-1)?.id, "learning-loop");
});

test("turn finalizer marks accepted inbox suggestion done only after successful completion", async () => {
  const { store } = createMemoryStore();
  const doneIds: number[] = [];
  const thread = {
    id: 44,
    messages: [],
    pendingAction: null,
  } as unknown as AgentThread;
  await store.append({
    eventKey: "turn:turn-suggestion-done:user",
    eventType: "user_received",
    payload: {
      message: "复盘逾期计划",
      suggestionSource: {
        suggestedPrompt: "复盘逾期计划",
        suggestionId: 301,
      },
    },
    recordedAt: "2026-06-23T01:00:00.000Z",
    schemaVersion: 1,
    threadId: 44,
    turnId: "turn-suggestion-done",
    userId: 7,
  });
  const finalize = createAgentTurnFinalizer({
    eventStore: store,
    markSuggestionDone: async (id) => {
      doneIds.push(id);
    },
    message: "复盘逾期计划",
    pendingBefore: null,
    project: async () => undefined,
    runLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    suggestionSource: {
      suggestedPrompt: "复盘逾期计划",
      suggestionId: 301,
    },
    thread,
    turnId: "turn-suggestion-done",
    user: { id: 7 },
  });

  await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: {
      assistantMessage: "已完成建议动作",
      engine: "workflow",
      intent: "query_progress",
      pendingAction: null,
      tokenUsage,
    },
    tokenUsage,
  });
  await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: {
      assistantMessage: "重放不应重复标记",
      engine: "workflow",
      intent: "query_progress",
      pendingAction: null,
      tokenUsage,
    },
    tokenUsage,
  });

  assert.deepEqual(doneIds, [301]);
});

test("non-projecting failure appends one failed event, skips learning, and projects no assistant", async () => {
  const { events, store } = createMemoryStore();
  let learningRuns = 0;
  let projectedMessages: unknown[] = [];
  const finalize = createAgentTurnFinalizer({
    eventStore: store, message: "查询进展", pendingBefore: null,
    project: async (projection) => { projectedMessages = projection.messages; },
    runLearningLoop: async () => { learningRuns += 1; return { candidates: [], decisions: [], savedMemories: [], source: "fallback", suggestedMemories: [] }; },
    thread: { id: 45, messages: [], pendingAction: null } as unknown as AgentThread,
    turnId: "turn-query-failed", user: { id: 7 },
  });
  await store.append({ eventKey: "turn:query:user", eventType: "user_received", payload: { message: "查询进展" }, recordedAt: "2026-07-13T08:00:00.000Z", schemaVersion: 1, threadId: 45, turnId: "turn-query-failed", userId: 7 });
  await finalize({
    existingMemories: [], failure: new Error("safe"), projectFailureAssistantMessage: false,
    pushTrace: () => undefined,
    response: { assistantMessage: "只读查询暂时不可用，请稍后重试。", engine: "workflow", intent: "clarify", pendingAction: null, tokenUsage }, tokenUsage,
  });
  assert.equal(learningRuns, 0);
  assert.equal(events.filter((event) => event.eventType === "turn_failed").length, 1);
  assert.equal((events.find((event) => event.eventType === "turn_failed")?.payload as { projectAssistantMessage?: boolean }).projectAssistantMessage, false);
  assert.deepEqual(projectedMessages, [{ content: "查询进展", role: "user" }]);
});
