import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  createAgentTurnFinalizer,
} from "../../src/lib/agent/turn-finalizer";
import type {
  AgentThreadEventRecord,
  AgentThreadEventStore,
} from "../../src/lib/agent/thread-events";
import type { AgentChatResponse } from "../../src/lib/agent/schemas";
import { createModelCallBudgetRecorder } from "../../src/lib/agent/orchestration/model-call-budget";
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

test("turn finalizer commits the terminal event before optional learning starts", async () => {
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
      assert.equal(
        events.some((event) => event.eventType === "assistant_completed"),
        true,
      );
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
  assert.equal(persistedResponse?.assistantMessage, "进度正常");
  assert.equal(persistedResponse?.trace?.some((step) => step.id === "learning-loop"), false);
  assert.equal(
    events.filter((event) => event.eventType === "assistant_completed").length,
    1,
  );
});

test("writing workbench completes without a second post-turn Learning model call", async () => {
  const { events, store } = createMemoryStore();
  let learningRuns = 0;
  const finalize = createAgentTurnFinalizer({
    eventStore: store,
    message: "请润色当前段落",
    pendingBefore: null,
    project: async () => undefined,
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
    thread: { id: 49, messages: [], pendingAction: null } as unknown as AgentThread,
    turnId: "turn-writing-one-call",
    user: { id: 7 },
    workbenchMode: "writing",
  });

  await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: {
      assistantMessage: "润色后的文本",
      engine: "workflow",
      intent: "answer_question",
      pendingAction: null,
      tokenUsage,
    },
    tokenUsage,
  });

  assert.equal(learningRuns, 0);
  assert.equal(
    events.filter((event) => event.eventType === "assistant_completed").length,
    1,
  );
});

test("turn finalizer injects learning model accounting into the production learning call", async () => {
  const { store } = createMemoryStore();
  const recorder = createModelCallBudgetRecorder();
  let receivedInvocation = false;
  const options = {
    eventStore: store,
    message: "总结进度",
    modelCallRecorder: recorder,
    pendingBefore: null,
    project: async () => undefined,
    runLearningLoop: async (input: Parameters<Parameters<typeof createAgentTurnFinalizer>[0]["runLearningLoop"]>[0]) => {
      const invocation = input.learningModelInvocation;
      receivedInvocation = Boolean(invocation);
      invocation?.logicalCallAuthorizer?.("learning-candidate:turn-finalizer");
      invocation?.providerAttemptAuthorizer?.(1);
      return {
        candidates: [],
        decisions: [],
        savedMemories: [],
        source: "fallback" as const,
        suggestedMemories: [],
      };
    },
    thread: { id: 46, messages: [], pendingAction: null } as unknown as AgentThread,
    turnId: "turn-learning-accounting",
    user: { id: 7 },
  };
  const finalize = createAgentTurnFinalizer(
    options as Parameters<typeof createAgentTurnFinalizer>[0],
  );

  await finalize({
    existingMemories: [],
    pushTrace: () => undefined,
    response: {
      assistantMessage: "进度正常",
      engine: "workflow",
      intent: "query_progress",
      pendingAction: null,
      tokenUsage,
    },
    tokenUsage,
  });

  const snapshot = recorder.snapshot();
  assert.equal(receivedInvocation, true);
  assert.equal(snapshot.learningLogicalCalls, 1);
  assert.equal(snapshot.learningProviderAttempts, 1);
});

test("the active chat entry creates and passes the recorder before constructing the finalizer", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/chat-pipeline/handle-agent-chat-post.ts"),
    "utf8",
  );
  const recorderIndex = source.indexOf("const modelCallRecorder = createModelCallBudgetRecorder()");
  const finalizerIndex = source.indexOf("const finalizeTurn = createAgentTurnFinalizer(");
  const finalizerConstruction = source.slice(finalizerIndex, finalizerIndex + 1_200);

  assert.notEqual(recorderIndex, -1);
  assert.notEqual(finalizerIndex, -1);
  assert.equal(recorderIndex < finalizerIndex, true);
  assert.match(finalizerConstruction, /modelCallRecorder/u);
});

test("learning failure cannot revoke or rewrite the already committed terminal event", async () => {
  const { events, store } = createMemoryStore();
  const rawSecret = "synthetic-learning-failure-secret-42";
  const pushedTrace: AgentChatResponse["trace"] = [];
  let terminalVisibleAtLearningStart = false;
  const finalize = createAgentTurnFinalizer({
    eventStore: store,
    message: "总结进度",
    pendingBefore: null,
    project: async () => undefined,
    runLearningLoop: async () => {
      terminalVisibleAtLearningStart = events.some(
        (event) => event.eventType === "assistant_completed",
      );
      throw new Error(`learning failed token=${rawSecret}`);
    },
    thread: { id: 47, messages: [], pendingAction: null } as unknown as AgentThread,
    turnId: "turn-learning-failure-after-terminal",
    user: { id: 7 },
  });

  const response = await finalize({
    existingMemories: [],
    pushTrace: (step) => pushedTrace?.push(step),
    response: {
      assistantMessage: "进度正常",
      engine: "workflow",
      intent: "query_progress",
      pendingAction: null,
      tokenUsage,
    },
    tokenUsage,
  });

  const terminalEvents = events.filter(
    (event) => event.eventType === "assistant_completed",
  );
  const persisted = terminalEvents[0]?.payload as { response?: AgentChatResponse };
  assert.equal(terminalVisibleAtLearningStart, true);
  assert.equal(response.assistantMessage, "进度正常");
  assert.equal(terminalEvents.length, 1);
  assert.equal(events.some((event) => event.eventType === "turn_failed"), false);
  assert.equal(persisted.response?.assistantMessage, "进度正常");
  assert.doesNotMatch(JSON.stringify(terminalEvents), new RegExp(rawSecret, "u"));
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
