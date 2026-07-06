import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentChatResponse, AgentIntent, AgentTraceStep } from "../../../src/lib/agent/schemas";
import { evaluateScheduleReadinessGate } from "../../../src/lib/agent/schedule/readiness-gate";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";

const queryIntent: AgentIntent = {
  args: {},
  confidence: 0.9,
  intent: "query_schedule",
};

const scheduleCreationIntent: AgentIntent = {
  args: {
    planId: 99,
    startDate: null,
  },
  confidence: 0.72,
  intent: "schedule_plan",
};

const misroutedScheduleCreationIntent: AgentIntent = {
  args: {
    sourceText: "帮我查看最近的日程安排",
  },
  confidence: 0.68,
  intent: "compose_schedule_item",
};

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 4,
  inputTokens: 2,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 6,
};

const sessionWithPlanSource: AgentSessionState = {
  schemaVersion: 1,
  updatedAt: "2026-06-01T00:00:00.000Z",
  semantic: {
    currentTarget: { entityType: "plan", topic: "SunnyPanel 上线计划" },
    domain: "planning",
    stage: "drafting",
    workflow: "plan_creation",
  },
  conversation: { lastTopic: "SunnyPanel 上线计划" },
  pending: {},
  planning: {
    draft: {
      assumptions: [],
      goal: "SunnyPanel 第一版上线",
      risks: [],
      sourcePlanId: 99,
      stages: [
        {
          description: "可上线版本",
          tasks: ["修复登录页", "整理发布文档"],
          title: "上线前",
        },
      ],
      title: "SunnyPanel 上线计划草案",
    },
    sourcePlanId: 99,
    workflow: "plan_creation",
  },
};

const makeThread = (): AgentThread => ({
  id: 940,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const contextWithSchedules = {
  checklists: [],
  now: "2026-06-29T09:00:00.000+08:00",
  pendingAction: null,
  plans: [],
  schedules: [
    {
      date: "2026-06-29",
      endTime: "10:00",
      id: 801,
      priority: "high",
      relatedChecklist: null,
      relatedPlan: { id: 99, title: "SunnyPanel 上线计划" },
      startTime: "09:00",
      status: "planned",
      title: "修复登录页",
    },
  ],
} as unknown as AgentPromptContext;

test("query_schedule bypasses ScheduleReadiness even when previous session has plan source", () => {
  const result = evaluateScheduleReadinessGate({
    intent: queryIntent,
    sessionState: sessionWithPlanSource,
    userMessage: "帮我查看最近的日程安排",
  });

  assert.equal(result.gateApplied, false);
  assert.equal(result.reason, "not_schedule_request");
});

test("schedule creation still enters ScheduleReadiness with the same previous session", () => {
  const result = evaluateScheduleReadinessGate({
    intent: scheduleCreationIntent,
    sessionState: sessionWithPlanSource,
    userMessage: "把计划排到下周日程里",
  });

  assert.equal(result.gateApplied, true);
  if (!result.gateApplied) return;
  assert.equal(result.pendingAction, null);
  assert.equal(result.readiness.status, "insufficient");
  assert.match(result.assistantMessage, /可用时段|投入|冲突处理/);
});

test("full pipeline corrects misrouted schedule creation query before dry-run or executor", async () => {
  const trace: AgentTraceStep[] = [];
  let dryRunCalled = false;
  let executeCalled = false;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) => ({
      ...makeThread(),
      pendingAction,
    }) as AgentThread,
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context: contextWithSchedules,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "schedule-query",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("query_schedule should not enter dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("query_schedule should not enter executor");
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
          intent: misroutedScheduleCreationIntent,
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
      conversationState: sessionWithPlanSource as never,
      finalizeTurn: async ({ response }) => ({
        ...response,
        threadId: 940,
      }),
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "帮我查看最近的日程安排",
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
  assert.equal(response.intent, "query_schedule");
  assert.equal(response.pendingAction, null);
  assert.equal(response.schedulingDraft, undefined);
  assert.ok(response.backendTraceEvents?.some((event) => event.phase === "api_call" && event.intent === "query_schedule"));
  assert.equal(response.backendTraceEvents?.some((event) => event.phase === "execute"), false);
  assert.equal(response.backendTraceEvents?.some((event) => event.phase === "receipt"), false);
  assert.equal(response.backendTraceEvents?.some((event) => event.phase === "rollback"), false);
  assert.match(response.assistantMessage, /最近|未来|日程/);
  assert.match(response.assistantMessage, /修复登录页/);
  assert.doesNotMatch(response.assistantMessage, /截止时间|可用时段|冲突处理策略/);
  assert.equal(trace.some((step) => step.id === "schedule-readiness-gate"), false);
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);
});
