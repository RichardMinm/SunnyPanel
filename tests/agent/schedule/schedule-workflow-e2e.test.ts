import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../../src/lib/agent/action-receipts";
import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "../../../src/lib/agent/schemas";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import { evaluateScheduleCreationPreparation } from "../../../src/lib/agent/schedule/prepare-schedule-creation";
import { evaluateScheduleReadinessGate } from "../../../src/lib/agent/schedule/readiness-gate";
import { createScheduleItemsFromIntent } from "../../../src/lib/agent/tools/schedule-create-items";
import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";
import {
  getPayloadClient,
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

const promptContext: AgentPromptContext = {
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

const answerIntent: AgentIntent = {
  args: { answer: "" },
  confidence: 0.8,
  intent: "answer_question",
};

const scheduleIntent: AgentIntent = {
  args: {
    sourceText: "帮我把这个清单安排到日程",
  },
  confidence: 0.88,
  intent: "compose_schedule_item",
};

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 8801,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeChecklistSourceSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    currentTarget: {
      entityType: "checklist",
      topic: "SunnyPanel 上线清单",
    },
    domain: "planning",
    stage: "drafting",
    workflow: "plan_creation",
  },
  conversation: {
    lastTopic: "SunnyPanel 上线清单",
  },
  planning: {
    sourcePlanId: 99,
    workflow: "plan_creation",
    checklistDraft: {
      sourcePlanId: 99,
      title: "SunnyPanel 上线清单草案",
      groups: [
        {
          title: "上线前",
          items: [
            { done: false, priority: "high", title: "修复登录页" },
            { done: false, priority: "medium", title: "整理发布文档" },
          ],
        },
      ],
    },
  },
  scheduling: {
    slots: {
      sourceChecklistId: 12,
      sourcePlanId: 99,
      sourceType: "checklist",
    },
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    workflow: "schedule_from_checklist",
  },
});

const makeUndatedDraftSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    currentTarget: {
      entityType: "schedule",
      topic: "未定日期日程草案",
    },
    domain: "schedule",
    stage: "drafting",
    workflow: "schedule_composition",
  },
  scheduling: {
    draft: {
      assumptions: ["这是草案，尚未写入日程。"],
      conflicts: ["尚未检查已有日程冲突。"],
      items: [
        {
          date: null,
          endTime: "22:00",
          sourcePlanId: 99,
          startTime: "20:00",
          title: "修复登录页",
        },
      ],
      nextActions: ["调整日期"],
      sourcePlanId: 99,
      sourceType: "plan",
      title: "未定日期日程草案",
    },
    slots: {
      availableTimeWindows: [{ day: "每天", endTime: "22:00", startTime: "20:00" }],
      sourcePlanId: 99,
      sourceType: "plan",
      tasks: [{ sourcePlanId: 99, title: "修复登录页" }],
    },
    sourcePlanId: 99,
    sourceType: "plan",
    workflow: "schedule_from_plan",
  },
});

beforeEach(() => {
  resetPayloadStub();
});

test("schedule workflow closes readiness draft confirmation execute receipt and rollback", async () => {
  const first = evaluateScheduleReadinessGate({
    intent: scheduleIntent,
    sessionState: makeChecklistSourceSession(),
    userMessage: "帮我把这个清单安排到日程",
  });

  assert.equal(first.gateApplied, true);
  if (!first.gateApplied) assert.fail("expected insufficient schedule gate");
  assert.equal(first.readiness.status, "insufficient");
  assert.equal(first.pendingAction, null);
  assert.equal(first.sessionState.scheduling?.readiness?.status, "insufficient");
  assert.equal(first.sessionState.scheduling?.draft, undefined);
  assert.match(first.assistantMessage, /需要确认|可用时段|投入时间/);
  assert.equal(getPayloadStubOperations().length, 0);

  const second = evaluateScheduleReadinessGate({
    intent: answerIntent,
    sessionState: first.sessionState,
    userMessage: "每天晚上 8 点到 10 点可以做，6 月 30 日前完成，冲突就问我。",
  });

  assert.equal(second.gateApplied, true);
  if (!second.gateApplied) assert.fail("expected draftable schedule gate");
  assert.equal(second.readiness.status, "draftable");
  assert.equal(second.pendingAction, null);
  assert.ok(second.scheduleDraft);
  assert.equal(second.sessionState.scheduling?.draft?.items.length, 2);
  assert.equal(second.sessionState.scheduling?.slots?.availableTimeWindows?.[0]?.startTime, "20:00");
  assert.equal(second.sessionState.scheduling?.slots?.availableTimeWindows?.[0]?.endTime, "22:00");
  assert.match(second.sessionState.scheduling?.slots?.deadline ?? "", /6 月 30 日/);
  assert.equal(second.sessionState.scheduling?.slots?.conflictPolicy, "ask");
  assert.match(second.assistantMessage, /日程草案/);
  assert.match(second.assistantMessage, /尚未写入日程|不会写入日程/);
  assert.equal(getPayloadStubOperations().length, 0);

  const concreteDraft: ScheduleDraft = {
    ...second.sessionState.scheduling!.draft!,
    sourceChecklistId: 12,
    sourcePlanId: 99,
    items: second.sessionState.scheduling!.draft!.items.map((item, index) => ({
      ...item,
      date: index === 0 ? "2026-06-29" : "2026-06-30",
      sourceChecklistId: 12,
      sourcePlanId: 99,
    })),
  };
  const concreteDraftSession = structuredClone(second.sessionState) as AgentSessionState;
  concreteDraftSession.scheduling = {
    ...concreteDraftSession.scheduling!,
    draft: concreteDraft,
  };

  const prepared = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: concreteDraftSession,
    userMessage: "就按这个日程草案创建日程",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared schedule creation");
  assert.equal(prepared.intent.intent, "create_schedule_items");
  assert.equal(prepared.intent.args.items.length, 2);

  const trace: AgentTraceStep[] = [];
  const persistedPendingActions: PendingAction[] = [];
  const dryRun = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context: promptContext,
    conversationState: prepared.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {} as never,
    persistAgentTurn: async ({ nextPendingAction }) => {
      if (nextPendingAction) persistedPendingActions.push(nextPendingAction);
      return makeThread(nextPendingAction);
    },
    pushTrace: (step) => trace.push(step),
    resolution: {
      engine: "heuristic",
      intent: prepared.intent,
    },
    tokenUsage,
    trace,
    turnAudit: {} as never,
    user: { id: 7 },
  });

  assert.equal(dryRun.outcome, "early_exit");
  if (dryRun.outcome !== "early_exit") assert.fail("expected pending confirmation");
  assert.equal(dryRun.response.pendingAction?.type, "await_confirmation");
  assert.equal(dryRun.response.pendingAction?.action.intent, "create_schedule_items");
  assert.deepEqual(dryRun.response.pendingAction?.action.args, prepared.intent.args);
  assert.equal(persistedPendingActions.length, 1);
  assert.ok(trace.some((step) => step.id === "action-dry-run"));
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );

  let savedReceiptResponse: unknown = null;
  let nextScheduleItemId = 900;
  const receiptStore: AgentActionReceiptStore = {
    claim: async () =>
      savedReceiptResponse
        ? {
            response: savedReceiptResponse,
            status: "replay",
          }
        : {
            receiptId: 1,
            status: "claimed",
          },
    complete: async (_receiptId, response) => {
      savedReceiptResponse = response;
    },
    markIndeterminate: async () => undefined,
  };
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
        id: 9901,
        ...args.data,
      };
    }

    return {};
  });

  const pendingAction = dryRun.response.pendingAction;
  if (pendingAction?.type !== "await_confirmation") {
    assert.fail("expected await confirmation action");
  }
  const execute = () => createScheduleItemsFromIntent(prepared.intent.args, undefined, { userId: 7 });
  const firstExecute = await runIdempotentAgentAction({
    actionId: pendingAction.action.id,
    execute,
    intent: "create_schedule_items",
    store: receiptStore,
    threadId: 8801,
    userId: 7,
  });
  const replayedExecute = await runIdempotentAgentAction({
    actionId: pendingAction.action.id,
    execute,
    intent: "create_schedule_items",
    store: receiptStore,
    threadId: 8801,
    userId: 7,
  });
  const scheduleCreates = getPayloadStubOperations().filter(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === "schedule-items",
  );

  assert.equal(firstExecute.status, "completed");
  assert.deepEqual(replayedExecute, firstExecute);
  assert.deepEqual(firstExecute.createdScheduleItemIds, [901, 902]);
  assert.equal(firstExecute.itemsCount, 2);
  assert.equal(firstExecute.dateRange, "2026-06-29 → 2026-06-30");
  assert.deepEqual(savedReceiptResponse, firstExecute);
  assert.equal(scheduleCreates.length, 2);
  assert.equal((scheduleCreates[0]?.args as { data: { title?: string } }).data.title, "修复登录页");
  assert.equal((scheduleCreates[0]?.args as { data: { date?: string } }).data.date, "2026-06-29");
  assert.equal((scheduleCreates[0]?.args as { data: { startTime?: string } }).data.startTime, "20:00");
  assert.equal((scheduleCreates[0]?.args as { data: { endTime?: string } }).data.endTime, "22:00");
  assert.equal((scheduleCreates[0]?.args as { data: { status?: string } }).data.status, "planned");
  assert.equal((scheduleCreates[0]?.args as { data: { priority?: string } }).data.priority, "medium");
  assert.equal((scheduleCreates[0]?.args as { data: { createdBy?: string } }).data.createdBy, "agent");
  assert.equal((scheduleCreates[0]?.args as { data: { relatedPlan?: number } }).data.relatedPlan, 99);
  assert.equal((scheduleCreates[0]?.args as { data: { relatedChecklist?: number } }).data.relatedChecklist, 12);
  assert.equal((scheduleCreates[0]?.args as { data: { relatedChecklistItemKey?: string } }).data.relatedChecklistItemKey, "1-1-修复登录页");
  assert.match(firstExecute.assistantMessage, /已创建 2 个日程项/);

  const payload = await getPayloadClient();
  const unrelatedBeforeRollback = { collection: "schedule-items", id: 999, overrideAccess: true };
  const rollbackResult = await executeRollbackFromPayload(firstExecute.rollbackPayload, {
    payload: payload as never,
    persistAudit: false,
  });
  await executeRollbackFromPayload(firstExecute.rollbackPayload, {
    payload: payload as never,
    persistAudit: false,
  });
  const deleteOperations = getPayloadStubOperations()
    .filter((operation) => operation.type === "delete")
    .map((operation) => operation.args);

  assert.equal(rollbackResult.strategy, "delete_created_documents");
  assert.deepEqual(rollbackResult.documentIds, [901, 902]);
  assert.ok(deleteOperations.some((args) => JSON.stringify(args) === JSON.stringify({ collection: "schedule-items", id: 901, overrideAccess: true })));
  assert.ok(deleteOperations.some((args) => JSON.stringify(args) === JSON.stringify({ collection: "schedule-items", id: 902, overrideAccess: true })));
  assert.equal(deleteOperations.some((args) => JSON.stringify(args) === JSON.stringify(unrelatedBeforeRollback)), false);
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        (operation.args as { collection?: string }).collection === "plans" ||
        (operation.args as { collection?: string }).collection === "checklists",
    ),
    false,
  );
});

test("undated ScheduleDraft cannot enter pending confirmation or write schedule items", () => {
  const result = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: makeUndatedDraftSession(),
    userMessage: "就按这个日程草案创建日程",
  });

  assert.equal(result.status, "invalid_draft");
  if (result.status !== "invalid_draft") assert.fail("expected invalid draft clarification");
  assert.equal(Boolean(result.sessionState.pending.confirmation), false);
  assert.match(result.assistantMessage, /未确定日期|补充具体日期|重新调整草案/);
  assert.equal(getPayloadStubOperations().length, 0);
});

test("legacy single schedule and schedule_plan dry-runs stay on their original intents", async () => {
  const single = await dryRunAgentIntent({
    args: {
      date: "2026-06-29",
      endTime: "22:00",
      startTime: "20:00",
      title: "修复登录页",
    },
    confidence: 0.9,
    intent: "compose_schedule_item",
  });
  const plan = await dryRunAgentIntent(
    {
      args: {
        planId: 99,
        startDate: "2026-06-29",
      },
      confidence: 0.9,
      intent: "schedule_plan",
    },
    {
      planCandidates: [
        {
          id: 99,
          priority: "medium",
          state: "active",
          title: "SunnyPanel 第一版上线计划",
        },
      ],
    },
  );

  assert.equal(single.type, "proposed_action");
  if (single.type !== "proposed_action") assert.fail("expected compose_schedule_item proposal");
  assert.equal(single.action.intent, "compose_schedule_item");
  assert.equal(plan.type, "proposed_action");
  if (plan.type !== "proposed_action") assert.fail("expected schedule_plan proposal");
  assert.equal(plan.action.intent, "schedule_plan");
});
