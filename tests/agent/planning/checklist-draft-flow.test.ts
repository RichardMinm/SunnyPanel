import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import {
  evaluateChecklistDraftGeneration,
} from "../../../src/lib/agent/planning/checklist-draft-flow";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { createDefaultSessionState, normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type {
  AgentChatResponse,
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
  now: "2026-06-30T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const samplePlanDraft: PlanDraft = {
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
  id: 980,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeDraftingSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    domain: "planning",
    stage: "reviewing",
    currentTarget: {
      entityType: "plan",
      topic: "SunnyPanel 第一版上线",
    },
    workflow: "plan_creation",
  },
  planning: {
    draft: samplePlanDraft,
    lastUpdatedAt: "2026-06-29T00:00:00.000+08:00",
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
  args: { sourceText: "创建计划" },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建正式计划",
    },
  ],
  id: "action-checklist-draft-test",
  intent: "compose_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建正式计划",
});

test("planning session with PlanDraft can generate a ChecklistDraft", () => {
  const result = evaluateChecklistDraftGeneration({
    intent: {
      args: { answer: "拆成清单" },
      intent: "answer_question",
    },
    pendingAction: null,
    sessionState: makeDraftingSession(),
    userMessage: "请把这个计划草案拆成清单草案",
  });

  assert.equal(result.status, "generated");
  if (result.status !== "generated") assert.fail("expected generated result");
  assert.equal(result.pendingAction, null);
  assert.equal(result.intent, "clarify");
  assert.equal(result.sessionState.planning?.checklistDraft?.sourcePlanTitle, samplePlanDraft.title);
  assert.equal(result.sessionState.planning?.checklistDraft?.groups[0].items[0].title, "修复登录页");
  assert.match(result.assistantMessage, /清单草案|尚未写入数据库/);
});

test("ChecklistDraft generation does not create pendingAction even when confirmation exists", () => {
  const pendingAction: PendingAction = {
    action: makeConfirmationAction(),
    type: "await_confirmation",
  };

  const result = evaluateChecklistDraftGeneration({
    intent: {
      args: { answer: "拆成清单" },
      intent: "answer_question",
    },
    pendingAction,
    sessionState: makeDraftingSession(),
    userMessage: "拆成清单",
  });

  assert.equal(result.status, "generated");
  if (result.status !== "generated") assert.fail("expected generated result");
  assert.equal(result.pendingAction, null);
  assert.equal(result.sessionState.pending.confirmation, null);
});

test("missing PlanDraft returns a clear no-draft response", () => {
  const session = makeDraftingSession();
  session.planning = {
    ...session.planning,
    draft: null,
  };

  const result = evaluateChecklistDraftGeneration({
    intent: {
      args: { answer: "拆成清单" },
      intent: "answer_question",
    },
    pendingAction: null,
    sessionState: session,
    userMessage: "拆成清单",
  });

  assert.equal(result.status, "missing_draft");
  if (result.status !== "missing_draft") assert.fail("expected missing draft result");
  assert.equal(result.pendingAction, null);
  assert.match(result.assistantMessage, /当前没有可拆解的计划草案/);
});

test("LangGraph ChecklistDraft generation returns before dry-run or execute", async () => {
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
        sessionId: "checklist-draft",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("ChecklistDraft should not enter dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("ChecklistDraft should not execute");
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
            args: { answer: "拆成清单", openDomainTopic: "SunnyPanel 第一版上线" },
            confidence: 0.86,
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
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "请把这个计划草案拆成清单草案",
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
  assert.ok(response.planningChecklistDraft?.groups.length);
  assert.ok(session.planning?.checklistDraft?.groups.length);
  assert.ok(trace.some((step) => step.id === "checklist-draft-generation"));
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);
});

test("legacy pipeline is wired to generate checklist drafts before prepare/readiness/dry-run", () => {
  const source = readFileSync("src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts", "utf8");

  assert.match(source, /evaluateChecklistDraftGeneration/);
  assert.ok(
    source.indexOf("const checklistDraftGeneration = evaluateChecklistDraftGeneration") <
      source.indexOf("const planCreationPreparation = checklistCreationPreparation.status"),
    "checklist draft generation should run before prepare creation",
  );
  assert.ok(
    source.indexOf("const checklistDraftGeneration = evaluateChecklistDraftGeneration") <
      source.indexOf("const dryResult = await runDryRunAndProposeStep"),
    "checklist draft generation should run before dry-run",
  );
});

test("LangGraph path is wired through checklist draft helper before dry-run", () => {
  const source = readFileSync("src/lib/agent/langgraph/full-adapter.ts", "utf8");

  assert.match(source, /evaluateChecklistDraftGeneration/);
  assert.ok(
    source.indexOf("const checklistDraftGeneration = evaluateChecklistDraftGeneration") <
      source.indexOf("const planCreationPreparation = checklistCreationPreparation.status"),
    "checklist draft generation should run before prepare creation in LangGraph",
  );
});
