import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import {
  evaluatePlanDraftRevision,
} from "../../../src/lib/agent/planning/revise-plan-draft";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type {
  AgentChatResponse,
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
  now: "2026-06-30T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const sampleDraft: PlanDraft = {
  assumptions: ["草案未写入数据库"],
  availableTime: "每天 2 小时",
  currentProgress: "登录已完成",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  nextActions: ["继续调整草案", "就按这个创建"],
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前闭环",
      tasks: ["修复登录页", "补齐 Agent 对话"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 970,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeDraftingSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    domain: "planning",
    stage: "drafting",
    currentTarget: {
      entityType: "plan",
      topic: "SunnyPanel 第一版上线",
    },
    workflow: "plan_creation",
  },
  planning: {
    draft: sampleDraft,
    lastUpdatedAt: "2026-06-29T00:00:00.000+08:00",
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
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话、部署",
      successCriteria: "内测可用",
    },
    workflow: "plan_creation",
  },
});

const makeConfirmationAction = (): ProposedAgentAction => ({
  args: { sourceText: "从计划草案创建" },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "从草案创建计划",
    },
  ],
  id: "action-revise-plan-draft-test",
  intent: "compose_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "从计划草案创建正式计划",
});

test("session with draft and revise wording enters revise_plan_draft", () => {
  const result = evaluatePlanDraftRevision({
    intent: {
      args: { answer: "调整草案", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    pendingAction: null,
    sessionState: makeDraftingSession(),
    userMessage: "调整一下，加上测试",
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised result");
  assert.equal(result.intent, "revise_plan_draft");
  assert.equal(result.pendingAction, null);
  assert.equal(result.sessionState.semantic.stage, "reviewing");
  assert.equal(result.sessionState.conversation.lastUserIntent, "revise_plan_draft");
  assert.ok(result.sessionState.planning?.draft?.stages.some((stage) => /测试|修复/u.test(stage.title)));
  assert.match(result.assistantMessage, /已更新计划草案|不会写入数据库/);
});

test("revise_plan_draft without draft returns clarification and no pending action", () => {
  const session = makeDraftingSession();
  session.planning = {
    ...session.planning,
    draft: null,
  };

  const result = evaluatePlanDraftRevision({
    intent: {
      args: { answer: "返回修改" },
      intent: "answer_question",
    },
    pendingAction: null,
    sessionState: session,
    userMessage: "返回修改",
  });

  assert.equal(result.status, "missing_draft");
  if (result.status !== "missing_draft") assert.fail("expected missing draft");
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /当前没有可修改的计划草案/);
});

test("slot filling without an existing draft is not treated as draft revision", () => {
  const session = makeDraftingSession();
  session.planning = {
    ...session.planning,
    draft: null,
  };

  const result = evaluatePlanDraftRevision({
    intent: {
      args: { answer: "补充计划上下文" },
      intent: "answer_question",
    },
    pendingAction: null,
    sessionState: session,
    userMessage: "上线标准是内测可用，必须包含测试和部署。",
  });

  assert.equal(result.status, "not_revision");
});

test("pending confirmation return-to-edit revises draft and clears pendingAction", () => {
  const pendingAction: PendingAction = {
    action: makeConfirmationAction(),
    type: "await_confirmation",
  };

  const result = evaluatePlanDraftRevision({
    intent: {
      args: { answer: "返回修改" },
      intent: "answer_question",
    },
    pendingAction,
    sessionState: makeDraftingSession(),
    userMessage: "我想返回修改这个计划草案，加上部署",
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised result");
  assert.equal(result.pendingAction, null);
  assert.equal(result.sessionState.semantic.stage, "reviewing");
  assert.ok(result.sessionState.planning?.draft?.stages.some((stage) => /部署|上线/u.test(stage.title)));
});

test("LangGraph revise_plan_draft returns draft response without dry-run or execute", async () => {
  let dryRunCalled = false;
  let executeCalled = false;
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
        sessionId: "revise-plan-draft",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("revise_plan_draft should not enter dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("revise_plan_draft should not execute");
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
            args: { answer: "调整一下", openDomainTopic: "SunnyPanel 第一版上线" },
            confidence: 0.82,
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
      conversationState: makeDraftingSession() as never,
      message: "调整一下，加上测试",
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

  assert.equal(dryRunCalled, false);
  assert.equal(executeCalled, false);
  assert.equal(response.pendingAction, null);
  assert.equal(response.intent, "clarify");
  assert.ok(response.planningDraft?.stages.some((stage) => /测试|修复/u.test(stage.title)));
});

test("Full LangGraph adapter is wired through the same revise helper before dry-run", () => {
  const source = readFileSync("src/lib/agent/langgraph/full-adapter.ts", "utf8");

  assert.match(source, /evaluatePlanDraftRevision/);
  assert.ok(
    source.indexOf("const planDraftRevision = evaluatePlanDraftRevision") <
      source.indexOf("const planCreationPreparation = checklistCreationPreparation.status"),
    "draft revision should run before prepare creation in Full LangGraph",
  );
});
