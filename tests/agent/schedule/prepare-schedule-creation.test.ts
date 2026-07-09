import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import {
  buildCreateScheduleItemsInputFromDraft,
  evaluateScheduleCreationPreparation,
} from "../../../src/lib/agent/schedule/prepare-schedule-creation";
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
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
} from "../../stubs/payload-client";

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
  plans: [
    {
      id: 99,
      priority: "medium",
      state: "active",
      title: "SunnyPanel 第一版上线计划",
    },
  ],
};

const sampleScheduleDraft: ScheduleDraft = {
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      sourceChecklistId: 12,
      sourceChecklistItemKey: "item-login",
      sourcePlanId: 99,
      sourceTaskTitle: "上线前",
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-30",
      endTime: "11:00",
      sourceChecklistId: 12,
      sourceChecklistItemKey: "item-docs",
      sourcePlanId: 99,
      sourceTaskTitle: "上线前",
      startTime: "09:00",
      title: "整理发布文档",
    },
  ],
  nextActions: ["调整时间", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
};

const answerIntent: AgentIntent = {
  args: { answer: "就按这个日程草案创建日程" },
  confidence: 0.86,
  intent: "answer_question",
};

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 991,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeScheduleDraftSession = (
  draft: ScheduleDraft | null = sampleScheduleDraft,
): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    currentTarget: {
      entityType: "schedule",
      topic: "SunnyPanel 日程草案",
    },
    domain: "schedule",
    stage: "drafting",
    workflow: "schedule_composition",
  },
  scheduling: {
    draft,
    lastUpdatedAt: "2026-06-29T00:00:00.000+08:00",
    readiness: {
      confidence: 0.84,
      knownSlots: ["tasks", "availableTimeWindows"],
      missingSlots: [],
      reason: "已有日程草案。",
      status: "draftable",
      suggestedQuestions: [],
    },
    slots: {
      availableTimeWindows: [{ day: "每天", endTime: "22:00", startTime: "20:00" }],
      sourceChecklistId: 12,
      sourcePlanId: 99,
      sourceType: "checklist",
      tasks: [
        { sourceChecklistId: 12, sourceChecklistItemKey: "item-login", sourcePlanId: 99, title: "修复登录页" },
      ],
    },
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    workflow: "schedule_from_checklist",
  },
});

const makeConfirmationAction = (args: unknown): ProposedAgentAction => ({
  args,
  changes: [
    {
      collection: "schedule-items",
      operation: "create",
      preview: "创建 2 个日程项",
    },
  ],
  id: "action-prepare-schedule-creation-test",
  intent: "create_schedule_items",
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建 2 个日程项",
});

test("buildCreateScheduleItemsInputFromDraft preserves title source ids and items", () => {
  const result = buildCreateScheduleItemsInputFromDraft(sampleScheduleDraft);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create schedule items args");
  assert.equal(result.args.title, sampleScheduleDraft.title);
  assert.equal(result.args.sourcePlanId, 99);
  assert.equal(result.args.sourceChecklistId, 12);
  assert.equal(result.args.items.length, 2);
  assert.equal(result.args.items[0]?.title, "修复登录页");
  assert.equal(result.args.items[0]?.date, "2026-06-29");
  assert.equal(result.args.items[0]?.startTime, "20:00");
  assert.equal(result.args.items[0]?.endTime, "22:00");
});

test("buildCreateScheduleItemsInputFromDraft preserves related ids keys and conflict notes", () => {
  const result = buildCreateScheduleItemsInputFromDraft(sampleScheduleDraft);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create schedule items args");
  assert.equal(result.args.items[0]?.relatedPlanId, 99);
  assert.equal(result.args.items[0]?.relatedChecklistId, 12);
  assert.equal(result.args.items[0]?.relatedChecklistItemKey, "item-login");
  assert.match(result.args.items[0]?.conflictNote ?? "", /冲突检测/);
  assert.equal(result.args.items[0]?.sourceTaskTitle, "上线前");
});

test("buildCreateScheduleItemsInputFromDraft rejects missing dates and empty items without mutation", () => {
  const original = structuredClone(sampleScheduleDraft);
  const missingDate = {
    ...sampleScheduleDraft,
    items: [{ ...sampleScheduleDraft.items[0], date: null }],
  } satisfies ScheduleDraft;
  const missingDateResult = buildCreateScheduleItemsInputFromDraft(missingDate);
  const emptyResult = buildCreateScheduleItemsInputFromDraft({
    ...sampleScheduleDraft,
    items: [],
  });

  assert.equal(missingDateResult.ok, false);
  if (missingDateResult.ok) assert.fail("expected missing date error");
  assert.equal(missingDateResult.error.code, "undated_schedule_draft_items");
  assert.ok(missingDateResult.error.missingFields.includes("items[0].date"));
  assert.equal(emptyResult.ok, false);
  if (emptyResult.ok) assert.fail("expected invalid draft error");
  assert.equal(emptyResult.error.code, "invalid_schedule_draft");
  assert.deepEqual(sampleScheduleDraft, original);
});

test("existing ScheduleDraft and explicit create request prepares create_schedule_items intent", () => {
  const result = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(),
    userMessage: "就按这个日程草案创建日程",
  });

  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") assert.fail("expected prepared result");
  assert.equal(result.intent.intent, "create_schedule_items");
  assert.equal(result.intent.args.items.length, 2);
  assert.equal(result.sessionState.semantic.stage, "confirming");
  assert.equal(result.sessionState.scheduling?.draft?.title, sampleScheduleDraft.title);
  assert.equal(result.traceStep.id, "prepare-schedule-creation");
});

test("prepare schedule request without draft or with undated draft clarifies without pending", () => {
  const missing = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(null),
    userMessage: "准备创建日程",
  });
  const undatedDraft = {
    ...sampleScheduleDraft,
    items: [{ ...sampleScheduleDraft.items[0], date: null }],
  } satisfies ScheduleDraft;
  const invalid = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(undatedDraft),
    userMessage: "准备创建日程",
  });

  assert.equal(missing.status, "missing_draft");
  if (missing.status !== "missing_draft") assert.fail("expected missing draft");
  assert.match(missing.assistantMessage, /当前没有可创建的日程草案/);
  assert.equal(invalid.status, "invalid_draft");
  if (invalid.status !== "invalid_draft") assert.fail("expected invalid draft");
  assert.match(invalid.assistantMessage, /未确定日期|补充具体日期|重新调整草案/);
});

test("create_schedule_items dry-run creates proposed action with full args and rollback placeholder", async () => {
  const prepared = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(),
    userMessage: "准备创建日程",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared result");

  const dryRun = await dryRunAgentIntent(prepared.intent, {
    createActionId: () => "action-create-schedule-items-dry-run",
  });

  assert.equal(dryRun.type, "proposed_action");
  if (dryRun.type !== "proposed_action") assert.fail("expected proposed action");
  assert.equal(dryRun.action.intent, "create_schedule_items");
  assert.equal(dryRun.action.requiresConfirmation, true);
  assert.equal(dryRun.action.affectedDocuments?.[0]?.collection, "schedule-items");
  assert.equal(dryRun.action.affectedDocuments?.[0]?.operation, "create");
  assert.match(dryRun.action.summary, /创建 2 个日程项/);
  assert.match(dryRun.action.changes[0]?.preview ?? "", /2026-06-29 → 2026-06-30/);
  assert.equal(dryRun.action.rollbackAvailable, true);
  assert.deepEqual(dryRun.action.args, prepared.intent.args);
});

test("runDryRunAndProposeStep sends create_schedule_items through Policy Guard and pending confirmation", async () => {
  const prepared = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(),
    userMessage: "保存到日程",
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
  assert.equal(result.response.pendingAction?.action.intent, "create_schedule_items");
  assert.equal(result.response.pendingAction?.action.args, prepared.intent.args);
  assert.equal(persistedPendingActions[0]?.type, "await_confirmation");
  assert.ok(trace.some((step) => step.id === "action-dry-run"));
  assert.match(JSON.stringify(turnAudit), /Policy Guard/);
  assert.match(result.response.assistantMessage, /回复「确认」或「执行」后我再真正写入/);
});

test("confirmed create_schedule_items executes the K6 schedule item writer", async () => {
  resetPayloadStub();
  let nextScheduleItemId = 640;
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      nextScheduleItemId += 1;

      return {
        id: nextScheduleItemId,
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 77,
        ...args.data,
      };
    }

    return {};
  });

  const prepared = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(),
    userMessage: "创建日程",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared result");

  const result = await executeAgentIntent(prepared.intent, undefined, { userId: 1 });
  const createOperations = getPayloadStubOperations().filter((operation) => operation.type === "create");

  assert.equal(result.pendingAction, null);
  assert.equal(result.status, "completed");
  assert.match(result.assistantMessage, /已创建 2 个日程项/);
  assert.deepEqual(result.rollbackPayload, {
    strategy: "delete_created_documents",
    target: {
      collection: "schedule-items",
      documentIds: [641, 642],
    },
    planCleanup: [{ planId: 99, scheduleItemIds: [641, 642] }],
  });
  assert.equal(
    createOperations.filter((operation) => (operation.args as { collection?: string }).collection === "schedule-items")
      .length,
    2,
  );
});

test("LangGraph prepares ScheduleDraft creation through dry-run and does not execute", async () => {
  let dryRunCalled = false;
  let executeCalled = false;
  let dryRunIntentName: AgentIntent["intent"] | null = null;
  let dryRunItemCount: null | number = null;
  const pendingAction: PendingAction = {
    action: makeConfirmationAction({ title: sampleScheduleDraft.title }),
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
        sessionId: "prepare-schedule-creation",
      },
    }),
    runDryRunAndProposeStep: async ({ resolution, tokenUsage: usage }) => {
      dryRunCalled = true;
      dryRunIntentName = resolution.intent.intent;
      dryRunItemCount = resolution.intent.intent === "create_schedule_items"
        ? resolution.intent.args.items.length
        : null;

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "已生成待确认日程变更",
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          pendingAction,
          threadId: 991,
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
      conversationState: makeScheduleDraftSession() as never,
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "就按这个日程草案创建日程",
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
  assert.equal(dryRunIntentName, "create_schedule_items");
  assert.equal(dryRunItemCount, 2);
});

test("legacy pipeline is wired through schedule preparation before readiness gate", () => {
  const source = readFileSync("src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts", "utf8");

  assert.match(source, /evaluateScheduleCreationPreparation/);
  assert.match(source, /applyScheduleCreationPreparationToResolution/);
  assert.ok(
    source.indexOf("const scheduleCreationPreparation = evaluateScheduleCreationPreparation") <
      source.indexOf("const scheduleReadinessGate = effectiveScheduleCreationPreparation"),
    "schedule prepare should run before schedule readiness",
  );
});
