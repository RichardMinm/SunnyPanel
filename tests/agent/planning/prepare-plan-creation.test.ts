import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import {
  buildCreatePlanInputFromDraft,
  evaluatePlanCreationPreparation,
} from "../../../src/lib/agent/planning/prepare-plan-creation";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type {
  AgentChatResponse,
  AgentIntent,
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
  id: 960,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const sampleDraft: PlanDraft = {
  assumptions: ["草案未写入数据库"],
  availableTime: "每天 2 小时",
  currentProgress: "登录已完成",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  nextActions: ["完成部署检查"],
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前闭环",
      endDate: "2026-06-30",
      startDate: "2026-06-29",
      tasks: ["修复登录页", "补齐 Agent 对话", "完成部署检查"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

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

const makeConfirmationAction = (args: unknown): ProposedAgentAction => ({
  args,
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "从草案创建计划",
    },
  ],
  id: "action-prepare-plan-creation-test",
  intent: "compose_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "从计划草案创建正式计划",
});

test("buildCreatePlanInputFromDraft preserves title goal and deadline", () => {
  const result = buildCreatePlanInputFromDraft(sampleDraft, {
    deadline: "2026-06-30",
    goal: "SunnyPanel 第一版上线",
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create args");
  assert.equal(result.args.title, sampleDraft.title);
  assert.equal(result.args.goal, sampleDraft.goal);
  assert.equal(result.args.suggestedDueDate, sampleDraft.deadline);
  assert.equal(result.args.scope, sampleDraft.scope);
});

test("buildCreatePlanInputFromDraft converts stages and tasks into decomposed plan", () => {
  const result = buildCreatePlanInputFromDraft(sampleDraft, {});

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create args");
  assert.equal(result.args.decomposed?.phases[0]?.title, "上线收尾");
  assert.deepEqual(result.args.decomposed?.phases[0]?.milestones[0]?.tasks, sampleDraft.stages[0].tasks);
  assert.match(result.args.agentBrief ?? "", /修复登录页/);
  assert.match(result.args.agentBrief ?? "", /当前进度：登录已完成/);
});

test("buildCreatePlanInputFromDraft returns typed error for invalid draft", () => {
  const result = buildCreatePlanInputFromDraft(
    {
      ...sampleDraft,
      goal: "",
      stages: [],
    },
    {},
  );

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected typed error");
  assert.equal(result.error.code, "invalid_plan_draft");
  assert.ok(result.error.missingFields.includes("goal"));
  assert.ok(result.error.missingFields.includes("stages"));
});

test("existing draft and explicit create request prepares compose_plan intent", () => {
  const result = evaluatePlanCreationPreparation({
    intent: {
      args: { answer: "就按这个创建", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: makeDraftingSession(),
    userMessage: "就按这个草案创建计划",
  });

  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") assert.fail("expected prepared result");
  assert.equal(result.intent.intent, "compose_plan");
  assert.equal(result.intent.args.title, sampleDraft.title);
  assert.equal(result.sessionState.semantic.stage, "confirming");
  assert.equal(result.traceStep.id, "prepare-plan-creation");
});

test("draft creation request without draft returns clarification and no pending action", () => {
  const session = makeDraftingSession();
  session.planning = {
    ...session.planning,
    draft: null,
  };

  const result = evaluatePlanCreationPreparation({
    intent: {
      args: { sourceText: "准备创建计划" },
      intent: "compose_plan",
    },
    sessionState: session,
    userMessage: "准备创建计划",
  });

  assert.equal(result.status, "missing_draft");
  if (result.status !== "missing_draft") assert.fail("expected missing draft");
  assert.match(result.assistantMessage, /没有可创建的计划草案/);
});

test("LangGraph prepares draft creation through dry-run and does not execute", async () => {
  let dryRunCalled = false;
  let executeCalled = false;
  let dryRunIntentName: AgentIntent["intent"] | null = null;
  let dryRunIntentTitle: null | string = null;
  const pendingAction: PendingAction = {
    action: makeConfirmationAction({ sourceText: "从计划草案创建" }),
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
        sessionId: "prepare-plan-creation",
      },
    }),
    runDryRunAndProposeStep: async ({ resolution, tokenUsage: usage }) => {
      dryRunCalled = true;
      dryRunIntentName = resolution.intent.intent;
      dryRunIntentTitle = resolution.intent.intent === "compose_plan"
        ? resolution.intent.args.title ?? null
        : null;

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "已生成待确认变更",
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          pendingAction,
          threadId: 960,
          tokenUsage: usage,
        },
      };
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("execute should not run before confirmation");
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
            args: { answer: "就按这个创建", openDomainTopic: "SunnyPanel 第一版上线" },
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
      conversationState: makeDraftingSession() as never,
      message: "就按这个草案创建计划",
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
  assert.equal(executeCalled, false);
  assert.equal(response.pendingAction?.type, "await_confirmation");
  assert.equal(dryRunIntentName, "compose_plan");
  assert.equal(dryRunIntentTitle, sampleDraft.title);
});

test("Full LangGraph adapter is wired through the same prepare helper before readiness gate", () => {
  const source = readFileSync("src/lib/agent/langgraph/full-adapter.ts", "utf8");

  assert.match(source, /evaluatePlanCreationPreparation/);
  assert.match(source, /applyPlanCreationPreparationToResolution/);
  assert.ok(
    source.indexOf("const planCreationPreparation = evaluatePlanCreationPreparation") <
      source.indexOf("const planReadinessGate ="),
    "prepare should run before readiness gate",
  );
});
