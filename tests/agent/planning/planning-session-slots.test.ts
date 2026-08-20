import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  evaluatePlanReadinessGate,
  extractPlanSlotsFromMessage,
} from "../../../src/lib/agent/planning/readiness-gate";
import { createDefaultSessionState, normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type {
  AgentChatResponse,
  AgentTraceStep,
} from "../../../src/lib/agent/schemas";
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

const makeThread = (): AgentThread => ({
  id: 930,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const makePlanningSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    domain: "planning",
    stage: "clarifying",
    currentTarget: {
      entityType: "plan",
      topic: "SunnyPanel 第一版上线",
    },
    workflow: "plan_creation",
  },
  planning: {
    workflow: "plan_creation",
    slots: {
      deadline: "6月30日",
      goal: "SunnyPanel 第一版上线",
    },
    readiness: {
      confidence: 0.72,
      knownSlots: ["goal", "deadline"],
      missingSlots: ["scope", "currentProgress", "availableTime", "successCriteria"],
      reason: "大型计划仅有目标和截止时间，不足以生成可执行计划。",
      status: "insufficient",
      suggestedQuestions: [
        "第一版必须包含哪些功能或交付物？",
        "当前已经完成了哪些部分？",
        "6月30日前你每天大概能投入多少时间？",
      ],
    },
    lastSuggestedQuestions: [
      "第一版必须包含哪些功能或交付物？",
      "当前已经完成了哪些部分？",
      "6月30日前你每天大概能投入多少时间？",
    ],
    lastUpdatedAt: "2026-06-29T00:00:00.000+08:00",
  },
});

test("normalizeSessionState preserves clarifying planning state and sanitizes suggested questions", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-29T00:00:00.000+08:00",
    semantic: {
      domain: "planning",
      stage: "clarifying",
      currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      workflow: "plan_creation",
      slots: {
        deadline: "6月30日",
        goal: "SunnyPanel 第一版上线",
        scope: "",
        invalidSlot: "must be removed",
      },
      readiness: {
        status: "insufficient",
        confidence: 0.73,
        knownSlots: ["goal", "deadline", "bogus"],
        missingSlots: ["scope", "currentProgress", "availableTime", "successCriteria", "bogus"],
        suggestedQuestions: ["q1", "q2", "q3", "q4", "q5", "q6"],
        reason: "need more context",
      },
      lastSuggestedQuestions: ["q1", "q2", "q3", "q4", "q5", "q6"],
    },
  };

  const session = normalizeSessionState(raw);

  assert.equal(session.semantic.stage, "clarifying");
  assert.equal(session.planning?.workflow, "plan_creation");
  assert.deepStrictEqual(session.planning?.slots, {
    deadline: "6月30日",
    goal: "SunnyPanel 第一版上线",
  });
  assert.equal(session.planning?.readiness?.status, "insufficient");
  assert.deepStrictEqual(session.planning?.readiness?.knownSlots, ["goal", "deadline"]);
  assert.deepStrictEqual(session.planning?.readiness?.missingSlots, [
    "scope",
    "currentProgress",
    "availableTime",
    "successCriteria",
  ]);
  assert.equal(session.planning?.lastSuggestedQuestions?.length, 5);
});

test("normalizeSessionState ignores malformed planning without mutating raw input", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-29T00:00:00.000+08:00",
    semantic: {
      domain: "planning",
      stage: "clarifying",
      currentTarget: {},
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      slots: {
        constraints: "not-array",
        deliverables: ["部署", "", "部署"],
        goal: "  SunnyPanel 第一版上线  ",
      },
      readiness: {
        status: "invalid",
        confidence: "not-number",
      },
    },
  };
  const snapshot = structuredClone(raw);

  const session = normalizeSessionState(raw);

  assert.deepStrictEqual(raw, snapshot);
  assert.deepStrictEqual(session.planning?.slots, {
    deliverables: ["部署"],
    goal: "SunnyPanel 第一版上线",
  });
  assert.equal(session.planning?.readiness, undefined);
});

test("extractPlanSlotsFromMessage reads answer-like slot updates without an LLM", () => {
  const slots = extractPlanSlotsFromMessage(
    "第一版要包含登录、Agent 对话和部署；当前登录已经完成，还差 Agent 对话；每天能投入 3 小时；上线标准是内测可用，必须包含测试和文档。",
  );

  assert.equal(slots.scope, "第一版要包含登录、Agent 对话和部署");
  assert.equal(slots.currentProgress, "当前登录已经完成，还差 Agent 对话");
  assert.equal(slots.availableTime, "每天能投入 3 小时");
  assert.equal(slots.successCriteria, "上线标准是内测可用");
  assert.deepStrictEqual(slots.constraints, ["必须包含测试和文档"]);
});

test("insufficient first-turn plan gate returns a planning session patch", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { sourceText: "帮我计划 SunnyPanel 6月30日前上线" },
      intent: "compose_plan",
    },
    userMessage: "帮我计划 SunnyPanel 6月30日前上线",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected gate to apply");
  assert.equal(gate.sessionState.semantic.domain, "planning");
  assert.equal(gate.sessionState.semantic.stage, "clarifying");
  assert.equal(gate.sessionState.semantic.workflow, "plan_creation");
  assert.equal(gate.sessionState.semantic.currentTarget.topic, "SunnyPanel 第一版上线");
  assert.equal(gate.sessionState.planning?.slots?.goal, "SunnyPanel 第一版上线");
  assert.equal(gate.sessionState.planning?.slots?.deadline, "6月30日");
  assert.equal(gate.sessionState.planning?.readiness?.status, "insufficient");
  assert.ok((gate.sessionState.planning?.lastSuggestedQuestions?.length ?? 0) <= 5);
});

test("planning clarification follow-up can merge new slots even when router returns answer_question", () => {
  const session = makePlanningSession();
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { answer: "补充计划上下文", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: session,
    userMessage: "第一版要包含登录和 Agent 对话；当前登录已完成；每天能投入 2 小时。",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected follow-up gate to apply");
  assert.equal(gate.intent, "clarify");
  assert.equal(gate.pendingAction, null);
  assert.equal(gate.sessionState.planning?.slots?.goal, "SunnyPanel 第一版上线");
  assert.equal(gate.sessionState.planning?.slots?.scope, "第一版要包含登录和 Agent 对话");
  assert.equal(gate.sessionState.planning?.slots?.currentProgress, "当前登录已完成");
  assert.equal(gate.sessionState.planning?.slots?.availableTime, "每天能投入 2 小时");
});

test("planning clarification follow-up becomes draftable without pending confirmation", () => {
  const session = makePlanningSession();
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { answer: "补充计划上下文", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: session,
    userMessage:
      "第一版要包含登录和 Agent 对话；当前登录已完成；每天能投入 2 小时；上线标准是内测可用。",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected draftable gate response");
  assert.equal(gate.intent, "clarify");
  assert.equal(gate.pendingAction, null);
  assert.equal(gate.readiness.status, "draftable");
  assert.match(gate.assistantMessage, /生成一版计划草案|现在生成草案/);
  assert.equal(gate.sessionState.semantic.stage, "drafting");
  assert.equal(gate.sessionState.planning?.readiness?.status, "draftable");
});

test("non-planning answer_question is not treated as plan context", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { answer: "北京是中国的首都。", openDomainTopic: "北京" },
      intent: "answer_question",
    },
    userMessage: "那北京呢？",
  });

  assert.equal(gate.gateApplied, false);
  assert.equal(gate.reason, "not_plan_intent");
});

test("complete explicit create follow-up can continue to the old flow", () => {
  const session = makePlanningSession();
  session.planning = {
    ...session.planning,
    slots: {
      ...session.planning?.slots,
      availableTime: "每天 2 小时",
      currentProgress: "登录已完成",
      scope: "登录和 Agent 对话",
      successCriteria: "内测可用",
    },
  };

  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { sourceText: "就按这个创建" },
      intent: "compose_plan",
    },
    sessionState: session,
    userMessage: "就按这个创建",
  });

  assert.equal(gate.gateApplied, false);
  assert.equal(gate.reason, "ready_enough");
  assert.equal(gate.readiness?.status, "confirmable");
});

test("full LangGraph adapter persists planning session patch for insufficient first turn", async () => {
  const trace: AgentTraceStep[] = [];
  let dryRunCalled = false;
  let persistedConversationState: unknown = null;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ conversationState, pendingAction }) => {
      persistedConversationState = conversationState;
      return {
        ...makeThread(),
        conversationState,
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
        sessionId: "planning-session-slots",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("dry-run should not run for insufficient plan readiness");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("execute should not run for insufficient plan readiness");
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
          intent: {
            args: { sourceText: "帮我计划 SunnyPanel 6月30日前上线" },
            confidence: 0.9,
            intent: "compose_plan",
          },
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
      message: "帮我计划 SunnyPanel 6月30日前上线",
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
  const session = normalizeSessionState(persistedConversationState);

  assert.equal(dryRunCalled, false);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.equal(session.semantic.stage, "clarifying");
  assert.equal(session.planning?.readiness?.status, "insufficient");
  assert.ok(trace.some((step) => step.id === "plan-readiness-gate"));
});

test("full LangGraph adapter returns draftable response for planning follow-up without dry-run", async () => {
  let dryRunCalled = false;
  let persistedConversationState: unknown = null;
  const planningSession = makePlanningSession();
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ conversationState, pendingAction }) => {
      persistedConversationState = conversationState;
      return {
        ...makeThread(),
        conversationState,
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
        sessionId: "planning-session-slots-draftable",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("dry-run should not run for draftable follow-up");
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("execute should not run for draftable follow-up");
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
          intent: {
            args: { answer: "补充计划上下文", openDomainTopic: "SunnyPanel 第一版上线" },
            confidence: 0.8,
            intent: "answer_question",
          },
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
      conversationState: planningSession as never,
      message:
        "第一版要包含登录和 Agent 对话；当前登录已完成；每天能投入 2 小时；上线标准是内测可用。",
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

  const response = await run();
  const session = normalizeSessionState(persistedConversationState);

  assert.equal(dryRunCalled, false);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.equal(session.semantic.stage, "drafting");
  assert.equal(session.planning?.readiness?.status, "draftable");
});
