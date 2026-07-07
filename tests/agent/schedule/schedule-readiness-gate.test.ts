/**
 * [R6-B LEGACY HEURISTIC QUARANTINE]
 *
 * This test covers the pre-LLM Tool Planner heuristic business fallback path.
 * It is NOT part of the AGENT_REQUIRE_LLM=1 protected baseline.
 * Keep temporarily for AGENT_REQUIRE_LLM=0 legacy mode compatibility.
 * Do NOT delete until: Tool Planner replacement exists AND legacy mode is retired.
 * See: docs/phase-r6b-legacy-heuristic-test-quarantine.md
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import type { AgentIntent } from "../../../src/lib/agent/schemas";
import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type {
  AgentChatResponse,
  AgentTraceStep,
} from "../../../src/lib/agent/schemas";
import { evaluateScheduleReadinessGate } from "../../../src/lib/agent/schedule/readiness-gate";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";

const answerIntent: AgentIntent = {
  args: { answer: "" },
  confidence: 0.8,
  intent: "answer_question",
};

const scheduleIntent: AgentIntent = {
  args: {
    sourceText: "帮我排到日程",
  },
  confidence: 0.8,
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

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-06-29T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const makeThread = (): AgentThread => ({
  id: 930,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const sessionWithChecklistDraft: AgentSessionState = {
  schemaVersion: 1,
  updatedAt: "2026-06-01T00:00:00.000Z",
  semantic: {
    domain: "planning",
    stage: "drafting",
    currentTarget: { entityType: "checklist", topic: "SunnyPanel 任务清单" },
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

test("schedule readiness gate clarifies when source exists but time context is missing", () => {
  const result = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: sessionWithChecklistDraft,
    userMessage: "帮我排到日程",
  });

  assert.equal(result.gateApplied, true);
  if (!result.gateApplied) return;
  assert.equal(result.pendingAction, null);
  assert.equal(result.intent, "clarify");
  assert.equal(result.readiness.status, "insufficient");
  assert.match(result.assistantMessage, /需要确认|投入|时间段|日程/);
  assert.equal(result.sessionState.scheduling?.readiness?.status, "insufficient");
  assert.equal(result.sessionState.scheduling?.slots?.tasks?.length, 2);
});

test("schedule readiness gate becomes draftable after user adds available time", () => {
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
  assert.equal(second.pendingAction, null);
  assert.equal(second.readiness.status, "draftable");
  assert.match(second.assistantMessage, /信息足够|日程草案/);
  assert.equal(second.sessionState.scheduling?.slots?.availableTimeWindows?.[0]?.startTime, "20:00");
});

test("schedule readiness gate intercepts compose_schedule_item before dry-run semantics", () => {
  const result = evaluateScheduleReadinessGate({
    intent: scheduleIntent,
    sessionState: sessionWithChecklistDraft,
    userMessage: "帮我排到日程",
  });

  assert.equal(result.gateApplied, true);
  if (!result.gateApplied) return;
  assert.equal(result.pendingAction, null);
  assert.equal(result.traceStep.id, "schedule-readiness-gate");
  assert.equal(result.sessionState.pending.confirmation, undefined);
});

test("schedule readiness gate ignores non-schedule messages", () => {
  const result = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: sessionWithChecklistDraft,
    userMessage: "解释一下这个清单的优先级",
  });

  assert.equal(result.gateApplied, false);
});

test("full LangGraph adapter returns schedule clarification before dry-run", async () => {
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
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "schedule-gate",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("schedule readiness should return before dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("schedule readiness should not execute");
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
          intent: scheduleIntent,
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
      conversationState: sessionWithChecklistDraft as never,
      finalizeTurn: async ({ response }) => ({
        ...response,
        threadId: 930,
      }),
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "帮我排到日程",
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
  assert.match(response.assistantMessage, /写入日程|确认几个关键点/);
  assert.ok(trace.some((step) => step.id === "schedule-readiness-gate"));
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);
});
