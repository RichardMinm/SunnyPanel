import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { evaluateScheduleReadinessGate } from "../../../src/lib/agent/schedule/readiness-gate";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
} from "../../../src/lib/agent/schemas";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 4,
  inputTokens: 2,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 6,
};

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-06-29T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const answerIntent: AgentIntent = {
  args: { answer: "" },
  confidence: 0.8,
  intent: "answer_question",
};

const makeThread = (): AgentThread => ({
  id: 931,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const sessionWithChecklistDraft: AgentSessionState = {
  schemaVersion: 1,
  updatedAt: "2026-06-01T00:00:00.000Z",
  semantic: {
    currentTarget: { entityType: "checklist", topic: "SunnyPanel 任务清单" },
    domain: "planning",
    stage: "drafting",
    workflow: "plan_creation",
  },
  conversation: { lastTopic: "SunnyPanel 任务清单" },
  pending: {},
  planning: {
    workflow: "plan_creation",
    checklistDraft: {
      title: "SunnyPanel 任务清单草案",
      sourcePlanId: 99,
      groups: [
        {
          title: "上线前",
          items: [
            { title: "修复登录页", priority: "high", done: false },
            { title: "整理发布文档", priority: "medium", done: false },
          ],
        },
      ],
    },
  },
};

test("schedule readiness gate generates ScheduleDraft when readiness is draftable", () => {
  const first = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: sessionWithChecklistDraft,
    userMessage: "帮我排到日程",
  });
  assert.equal(first.gateApplied, true);
  if (!first.gateApplied) return;

  const second = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: first.sessionState,
    userMessage: "每天晚上 8 点到 10 点可以做，6 月 30 日前完成",
  });

  assert.equal(second.gateApplied, true);
  if (!second.gateApplied) return;
  assert.equal(second.readiness.status, "draftable");
  assert.equal(second.pendingAction, null);
  assert.equal(second.sessionState.scheduling?.draft?.items.length, 2);
  assert.equal(second.sessionState.scheduling?.draft?.items[0]?.startTime, "20:00");
  assert.match(second.assistantMessage, /日程草案/);
  assert.match(second.assistantMessage, /不会写入日程|尚未写入日程/);
  assert.match(second.assistantMessage, /尚未检查已有日程冲突/);
});

test("schedule confirmable stays response-only in K3", () => {
  const result = evaluateScheduleReadinessGate({
    hasExistingDraft: true,
    intent: answerIntent,
    sessionState: {
      schemaVersion: 1,
      updatedAt: "2026-06-01T00:00:00.000Z",
      semantic: {
        currentTarget: { entityType: "schedule", topic: "日程草案" },
        domain: "schedule",
        stage: "drafting",
        workflow: "schedule_composition",
      },
      conversation: {},
      pending: {},
      scheduling: {
        workflow: "manual_schedule",
        sourceType: "manual",
        slots: {
          tasks: [{ title: "修复登录页" }],
          availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }],
        },
        draft: {
          title: "日程草案",
          sourceType: "manual",
          items: [{ title: "修复登录页", startTime: "20:00", endTime: "22:00" }],
        },
      },
    } satisfies AgentSessionState,
    userMessage: "就按这个日程创建",
  });

  assert.equal(result.gateApplied, true);
  if (!result.gateApplied) return;
  assert.equal(result.pendingAction, null);
  assert.equal(result.readiness.status, "confirmable");
  assert.match(result.assistantMessage, /最终确认|准备创建日程/);
});

test("full LangGraph adapter returns ScheduleDraft before dry-run", async () => {
  const first = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: sessionWithChecklistDraft,
    userMessage: "帮我排到日程",
  });
  assert.equal(first.gateApplied, true);
  if (!first.gateApplied) return;

  const trace: AgentTraceStep[] = [];
  let capturedConversationState: unknown = null;
  let dryRunCalled = false;
  let executeCalled = false;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) => {
      return {
        ...makeThread(),
        pendingAction,
      } as AgentThread;
    },
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "schedule-draft-flow",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("ScheduleDraft should return before dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("ScheduleDraft should not execute");
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: {
        preResolvedIntent: null,
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({ tokenUsage: usage }) => ({
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "heuristic",
          intent: answerIntent,
        },
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      conversationState: first.sessionState as never,
      finalizeTurn: async ({ conversationStateOverride, response }) => {
        capturedConversationState = conversationStateOverride;
        return {
          ...response,
          threadId: 931,
        };
      },
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "每天晚上 8 点到 10 点可以做，6 月 30 日前完成",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread: makeThread(),
      user: { id: 1 },
      userPreferences: null,
      workbenchMode: null,
    },
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run(
    () => undefined,
    (step) => trace.push(step),
  );

  assert.equal(dryRunCalled, false);
  assert.equal(executeCalled, false);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.match(response.assistantMessage, /日程草案/);
  assert.match(response.assistantMessage, /尚未写入日程|不会写入日程/);
  assert.ok(trace.some((step) => step.id === "schedule-readiness-gate"));
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);

  const savedSession = capturedConversationState as AgentSessionState;
  assert.equal(savedSession.scheduling?.draft?.items.length, 2);
  assert.equal(savedSession.pending.confirmation, undefined);
});
