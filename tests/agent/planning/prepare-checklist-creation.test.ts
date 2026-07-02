import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { ChecklistDraft } from "../../../src/lib/agent/planning/checklist-draft";
import {
  buildCreateChecklistInputFromDraft,
  evaluateChecklistCreationPreparation,
} from "../../../src/lib/agent/planning/prepare-checklist-creation";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
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
  now: "2026-06-30T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const sampleChecklistDraft: ChecklistDraft = {
  assumptions: ["从计划草案拆出，尚未写入数据库。"],
  goal: "SunnyPanel 第一版上线",
  groups: [
    {
      description: "完成上线前闭环",
      items: [
        {
          description: "修复登录表单和鉴权回跳。",
          done: false,
          priority: "high",
          stageTitle: "上线收尾",
          title: "修复登录页",
        },
        {
          done: false,
          priority: "medium",
          stageTitle: "上线收尾",
          title: "补齐 Agent 对话",
        },
      ],
      title: "上线收尾",
    },
  ],
  nextActions: ["继续修改清单草案", "准备创建清单"],
  sourcePlanTitle: "SunnyPanel 第一版上线计划草案",
  title: "SunnyPanel 第一版上线任务清单草案",
};

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 990,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeChecklistDraftSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    domain: "planning",
    stage: "drafting",
    currentTarget: {
      entityType: "checklist",
      topic: "SunnyPanel 第一版上线",
    },
    workflow: "plan_creation",
  },
  planning: {
    checklistDraft: sampleChecklistDraft,
    lastUpdatedAt: "2026-06-30T00:00:00.000+08:00",
    workflow: "plan_creation",
  },
});

const makeConfirmationAction = (args: unknown): ProposedAgentAction => ({
  args,
  changes: [
    {
      collection: "checklists",
      operation: "create",
      preview: "从清单草案创建正式清单",
    },
  ],
  id: "action-prepare-checklist-creation-test",
  intent: "create_checklist",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建清单「SunnyPanel 第一版上线任务清单草案」",
});

test("buildCreateChecklistInputFromDraft preserves title source plan goal groups and items", () => {
  const result = buildCreateChecklistInputFromDraft(sampleChecklistDraft);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create checklist args");
  assert.equal(result.args.title, sampleChecklistDraft.title);
  assert.match(result.args.summary ?? "", /来源计划：SunnyPanel 第一版上线计划草案/);
  assert.match(result.args.summary ?? "", /目标：SunnyPanel 第一版上线/);
  assert.equal(result.args.groups.length, 1);
  assert.equal(result.args.groups[0]?.title, "上线收尾");
  assert.equal(result.args.groups[0]?.items?.length, 2);
  assert.equal(result.args.groups[0]?.items?.[0]?.title, "修复登录页");
  assert.equal(result.args.groups[0]?.items?.[0]?.isCompleted, false);
});

test("buildCreateChecklistInputFromDraft returns typed error for invalid draft", () => {
  const result = buildCreateChecklistInputFromDraft({
    ...sampleChecklistDraft,
    groups: [],
    title: "",
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected typed error");
  assert.equal(result.error.code, "invalid_checklist_draft");
  assert.ok(result.error.missingFields.includes("title"));
  assert.ok(result.error.missingFields.includes("groups"));
});

test("existing ChecklistDraft and explicit create request prepares create_checklist intent", () => {
  const result = evaluateChecklistCreationPreparation({
    intent: {
      args: { answer: "就按这个创建", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: makeChecklistDraftSession(),
    userMessage: "就按这个清单草案创建清单",
  });

  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") assert.fail("expected prepared result");
  assert.equal(result.intent.intent, "create_checklist");
  assert.equal(result.intent.args.title, sampleChecklistDraft.title);
  assert.equal(result.sessionState.semantic.stage, "confirming");
  assert.equal(result.traceStep.id, "prepare-checklist-creation");
});

test("prepare checklist request without draft returns clarification and no pending action", () => {
  const session = makeChecklistDraftSession();
  session.planning = {
    ...session.planning,
    checklistDraft: null,
  };

  const result = evaluateChecklistCreationPreparation({
    intent: {
      args: { answer: "准备创建清单" },
      intent: "answer_question",
    },
    sessionState: session,
    userMessage: "准备创建清单",
  });

  assert.equal(result.status, "missing_draft");
  if (result.status !== "missing_draft") assert.fail("expected missing draft");
  assert.match(result.assistantMessage, /当前没有可创建的清单草案/);
});

test("create_checklist dry-run creates checklist proposed action without execution", async () => {
  const prepared = evaluateChecklistCreationPreparation({
    intent: {
      args: { answer: "准备创建清单" },
      intent: "answer_question",
    },
    sessionState: makeChecklistDraftSession(),
    userMessage: "准备创建清单",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared result");

  const dryRun = await dryRunAgentIntent(prepared.intent, {
    createActionId: () => "action-checklist-dry-run",
  });

  assert.equal(dryRun.type, "proposed_action");
  if (dryRun.type !== "proposed_action") assert.fail("expected proposed action");
  assert.equal(dryRun.action.intent, "create_checklist");
  assert.equal(dryRun.action.requiresConfirmation, true);
  assert.equal(dryRun.action.affectedDocuments?.[0]?.collection, "checklists");
  assert.equal(dryRun.action.affectedDocuments?.[0]?.operation, "create");
  assert.match(dryRun.action.summary, /创建清单/);
  assert.match(dryRun.action.summary, /1 个分组/);
  assert.match(dryRun.action.summary, /2 个条目/);
});

test("runDryRunAndProposeStep sends create_checklist through Policy Guard and pending confirmation", async () => {
  const prepared = evaluateChecklistCreationPreparation({
    intent: {
      args: { answer: "保存为清单" },
      intent: "answer_question",
    },
    sessionState: makeChecklistDraftSession(),
    userMessage: "保存为清单",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared result");

  const persistedPendingActions: PendingAction[] = [];
  const trace: AgentTraceStep[] = [];
  const turnAudit = {};
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: prepared.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {} as never,
    persistAgentTurn: async ({ nextPendingAction }) => {
      if (nextPendingAction) {
        persistedPendingActions.push(nextPendingAction);
      }
      return makeThread(nextPendingAction);
    },
    pushTrace: (step) => {
      trace.push(step);
    },
    resolution: {
      engine: "heuristic",
      intent: prepared.intent,
    },
    tokenUsage,
    trace,
    turnAudit: turnAudit as never,
    user: { id: 1 },
  });

  assert.equal(result.outcome, "early_exit");
  if (result.outcome !== "early_exit") assert.fail("expected pending confirmation response");
  assert.equal(result.response.pendingAction?.type, "await_confirmation");
  assert.equal(result.response.pendingAction?.action.intent, "create_checklist");
  assert.equal(persistedPendingActions[0]?.type, "await_confirmation");
  assert.ok(trace.some((step) => step.id === "action-dry-run"));
  assert.match(result.response.assistantMessage, /回复「确认」或「执行」后我再真正写入/);
});

test("LangGraph prepares ChecklistDraft creation through dry-run and does not execute", async () => {
  let dryRunCalled = false;
  let executeCalled = false;
  let dryRunIntentName: AgentIntent["intent"] | null = null;
  let dryRunGroupCount: null | number = null;
  const pendingAction: PendingAction = {
    action: makeConfirmationAction({ title: sampleChecklistDraft.title }),
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
        sessionId: "prepare-checklist-creation",
      },
    }),
    runDryRunAndProposeStep: async ({ resolution, tokenUsage: usage }) => {
      dryRunCalled = true;
      dryRunIntentName = resolution.intent.intent;
      dryRunGroupCount = resolution.intent.intent === "create_checklist"
        ? resolution.intent.args.groups.length
        : null;

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "已生成待确认清单变更",
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          pendingAction,
          threadId: 990,
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
            args: { answer: "准备创建清单", openDomainTopic: "SunnyPanel 第一版上线" },
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
      conversationState: makeChecklistDraftSession() as never,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "就按这个清单草案创建清单",
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
  assert.equal(dryRunIntentName, "create_checklist");
  assert.equal(dryRunGroupCount, 1);
});

test("legacy pipeline is wired through checklist preparation before plan preparation", () => {
  const source = readFileSync("src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts", "utf8");

  assert.match(source, /evaluateChecklistCreationPreparation/);
  assert.match(source, /applyChecklistCreationPreparationToResolution/);
  assert.ok(
    source.indexOf("const checklistCreationPreparation = evaluateChecklistCreationPreparation") <
      source.indexOf("const planCreationPreparation = checklistCreationPreparation.status"),
    "checklist prepare should run before plan prepare",
  );
});
