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

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import {
  evaluatePlanReadinessGate,
} from "../../../src/lib/agent/planning/readiness-gate";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { createDefaultSessionState, normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
  ProposedAgentAction,
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
  id: 940,
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

const makeDraftingSession = (): AgentSessionState => {
  const session = makePlanningSession();
  session.semantic.stage = "drafting";
  session.planning = {
    ...session.planning,
    draft: {
      assumptions: ["规则草案，未写入数据库"],
      availableTime: "每天 2 小时",
      currentProgress: "登录已完成",
      deadline: "6月30日",
      goal: "SunnyPanel 第一版上线",
      nextActions: ["调整阶段", "就按这个创建"],
      risks: ["时间紧"],
      scope: "登录和 Agent 对话",
      stages: [
        {
          tasks: ["补齐 Agent 对话", "完成部署"],
          title: "上线收尾",
        },
      ],
      successCriteria: "内测可用",
      title: "SunnyPanel 第一版上线计划草案",
    },
    readiness: {
      confidence: 0.86,
      knownSlots: ["goal", "deadline", "scope", "currentProgress", "availableTime", "successCriteria"],
      missingSlots: [],
      reason: "计划上下文足够生成草案。",
      status: "draftable",
      suggestedQuestions: [],
    },
    slots: {
      availableTime: "每天 2 小时",
      currentProgress: "登录已完成",
      deadline: "6月30日",
      goal: "SunnyPanel 第一版上线",
      scope: "登录和 Agent 对话",
      successCriteria: "内测可用",
    },
  };
  return session;
};

const makeConfirmationAction = (intent: AgentIntent["intent"]): ProposedAgentAction => ({
  args: { sourceText: "创建小型计划" },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建小型计划",
    },
  ],
  id: "action-plan-draft-test",
  intent,
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建小型计划",
});

test("draftable planning follow-up generates a draft without pendingAction", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { answer: "补充计划上下文", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: makePlanningSession(),
    userMessage:
      "第一版要包含登录和 Agent 对话；当前登录已完成；每天能投入 2 小时；上线标准是内测可用，必须包含测试和部署。",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected draft gate response");
  assert.equal(gate.pendingAction, null);
  assert.equal(gate.readiness.status, "draftable");
  assert.equal(gate.sessionState.semantic.stage, "drafting");
  assert.ok(gate.sessionState.planning?.draft);
  assert.equal(gate.sessionState.planning?.draft?.goal, "SunnyPanel 第一版上线");
  assert.ok((gate.sessionState.planning?.draft?.stages.length ?? 0) > 0);
  assert.match(gate.assistantMessage, /不会写入数据库|还不会写入数据库/);
  assert.match(gate.assistantMessage, /阶段|关键任务|验收标准/);
});

test("draft intent in an existing draftable session generates and persists a draft", () => {
  const session = makePlanningSession();
  session.planning = {
    ...session.planning,
    readiness: {
      confidence: 0.86,
      knownSlots: ["goal", "deadline", "scope", "currentProgress", "availableTime", "successCriteria"],
      missingSlots: [],
      reason: "计划上下文足够生成草案。",
      status: "draftable",
      suggestedQuestions: [],
    },
    slots: {
      availableTime: "每天 2 小时",
      currentProgress: "登录已完成",
      deadline: "6月30日",
      goal: "SunnyPanel 第一版上线",
      scope: "登录和 Agent 对话",
      successCriteria: "内测可用",
    },
  };

  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { answer: "生成草案", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: session,
    userMessage: "先给我一版计划草案",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected draft gate response");
  assert.equal(gate.pendingAction, null);
  assert.equal(gate.sessionState.planning?.draft?.title, "SunnyPanel 第一版上线计划草案");
});

test("explicit create from an existing draft is no longer swallowed by readiness gate", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { sourceText: "就按这个创建" },
      intent: "compose_plan",
    },
    sessionState: makeDraftingSession(),
    userMessage: "就按这个创建",
  });

  assert.equal(gate.gateApplied, false);
});

test("small explicit plan still follows old dry-run path", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: {
        sourceText: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
      },
      intent: "compose_plan",
    },
    userMessage: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
  });

  assert.equal(gate.gateApplied, false);
});

test("non-planning answer_question is unaffected by draft flow", () => {
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

test("full LangGraph adapter returns draft response before dry-run and persists session draft", async () => {
  let dryRunCalled = false;
  let executeCalled = false;
  let persistedConversationState: unknown = null;
  const trace: AgentTraceStep[] = [];
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
        sessionId: "planning-draft-flow",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("dry-run should not run for draft_plan response");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("execute should not run for draft_plan response");
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
      conversationState: makePlanningSession() as never,
      message:
        "第一版要包含登录和 Agent 对话；当前登录已完成；每天能投入 2 小时；上线标准是内测可用，必须包含测试和部署。",
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
  assert.equal(executeCalled, false);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.ok(session.planning?.draft);
  assert.equal(session.semantic.stage, "drafting");
  assert.ok(trace.some((step) => step.id === "plan-readiness-gate"));
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);
});

test("full LangGraph adapter keeps old dry-run path for small explicit plans", async () => {
  let dryRunCalled = false;
  const pendingAction: PendingAction = {
    action: makeConfirmationAction("compose_plan"),
    type: "await_confirmation",
  };
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction: nextPendingAction }) => ({
      ...makeThread(),
      pendingAction: nextPendingAction,
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
        sessionId: "planning-draft-small-plan",
      },
    }),
    runDryRunAndProposeStep: async ({ tokenUsage: usage }) => {
      dryRunCalled = true;

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "已生成待确认变更",
          confidence: 0.9,
          engine: "heuristic",
          intent: "compose_plan",
          pendingAction,
          threadId: 940,
          tokenUsage: usage,
        },
      };
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("execute is not part of this test");
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
            args: {
              sourceText: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
            },
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
      message: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
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

  assert.equal(dryRunCalled, true);
  assert.equal(response.pendingAction?.type, "await_confirmation");
});
