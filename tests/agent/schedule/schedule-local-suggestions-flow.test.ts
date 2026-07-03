import assert from "node:assert/strict";
import { test } from "node:test";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import {
  scheduleConflictSuggestionToUserMessage,
  type ScheduleConflictSuggestion,
} from "../../../src/lib/agent/schedule/conflict-suggestions";
import { evaluateScheduleCreationPreparation } from "../../../src/lib/agent/schedule/prepare-schedule-creation";
import { evaluateScheduleDraftRevision } from "../../../src/lib/agent/schedule/revise-draft-flow";
import type {
  AgentChatResponse,
  AgentIntent,
  CreateScheduleItemsArgs,
} from "../../../src/lib/agent/schemas";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubFindHandler,
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
  now: "2026-06-30T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const answerIntent: AgentIntent = {
  args: { answer: "" },
  confidence: 0.8,
  intent: "answer_question",
};

const createScheduleItemsArgs = (): CreateScheduleItemsArgs => ({
  conflictPolicy: "ask",
  items: [
    {
      date: "2026-06-30",
      endTime: "21:00",
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-deploy",
      relatedPlanId: 99,
      startTime: "20:00",
      title: "部署验证",
    },
  ],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceText: "从日程草案准备创建正式日程。",
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
});

const createScheduleItemsIntent = (): Extract<AgentIntent, { intent: "create_schedule_items" }> => ({
  args: createScheduleItemsArgs(),
  confidence: 0.91,
  intent: "create_schedule_items",
});

const makeScheduleDraftSession = (): AgentSessionState => ({
  conversation: { lastTopic: "SunnyPanel 上线日程" },
  pending: {},
  schemaVersion: 1,
  semantic: {
    currentTarget: { entityType: "schedule", topic: "SunnyPanel 上线日程" },
    domain: "schedule",
    stage: "confirming",
    workflow: "schedule_composition",
  },
  scheduling: {
    draft: {
      assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
      conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
      items: [
        {
          date: "2026-06-30",
          endTime: "21:00",
          sourceChecklistItemKey: "item-deploy",
          startTime: "20:00",
          title: "部署验证",
        },
      ],
      nextActions: ["调整时间", "就按这个创建日程"],
      sourceChecklistId: 12,
      sourcePlanId: 99,
      sourceType: "checklist",
      title: "清单日程草案：1 项任务",
    },
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "23:00", startTime: "20:00" },
      ],
      conflictPolicy: "ask",
      sourceChecklistId: 12,
      sourcePlanId: 99,
      sourceType: "checklist",
    },
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceType: "checklist",
    workflow: "schedule_from_checklist",
  },
  updatedAt: "2026-06-30T00:00:00.000Z",
});

const makeThread = (
  pendingAction: AgentChatResponse["pendingAction"] = null,
): AgentThread => ({
  id: 8841,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const setupExistingScheduleStub = () => {
  resetPayloadStub();
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };
    if (args.collection !== "schedule-items") return { docs: [], totalDocs: 0 };

    return {
      docs: [
        {
          date: "2026-06-30",
          endTime: "21:00",
          id: 501,
          isAllDay: false,
          startTime: "20:00",
          status: "planned",
          title: "已有发布会",
        },
      ],
      totalDocs: 1,
    };
  });
};

test("dry-run conflict suggestions include local free slot suggestions without writing", async () => {
  setupExistingScheduleStub();
  const payload = await getPayloadClient();
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: makeScheduleDraftSession(),
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: payload as never,
    persistAgentTurn: async ({ nextPendingAction }) => makeThread(nextPendingAction),
    pushTrace: () => undefined,
    resolution: {
      engine: "heuristic",
      intent: createScheduleItemsIntent(),
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  assert.equal(result.outcome, "early_exit");
  if (result.outcome !== "early_exit") assert.fail("expected pending confirmation");
  const snapshot = result.response.pendingAction?.type === "await_confirmation"
    ? result.response.pendingAction.action.afterSnapshot as { conflictSuggestions?: ScheduleConflictSuggestion[] }
    : null;
  const move = snapshot?.conflictSuggestions?.find(
    (suggestion) => suggestion.action.type === "move_item",
  );

  assert.ok(move);
  if (!move || move.action.type !== "move_item") assert.fail("expected local move suggestion");
  assert.equal(move.action.startTime, "21:00");
  assert.equal(move.action.endTime, "22:00");
  assert.match(move.description ?? "", /仅基于 SunnyPanel 本地日程检测，未包含外部日历/);
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );
});

test("selecting local free slot suggestion reuses L2 revise flow and rechecks on next prepare", async () => {
  setupExistingScheduleStub();
  const payload = await getPayloadClient();
  const dryRunResult = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: makeScheduleDraftSession(),
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: payload as never,
    persistAgentTurn: async ({ nextPendingAction }) => makeThread(nextPendingAction),
    pushTrace: () => undefined,
    resolution: {
      engine: "heuristic",
      intent: createScheduleItemsIntent(),
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  assert.equal(dryRunResult.outcome, "early_exit");
  if (dryRunResult.outcome !== "early_exit") assert.fail("expected pending confirmation");
  const pendingAction = dryRunResult.response.pendingAction;
  const suggestions = pendingAction?.type === "await_confirmation" &&
    (pendingAction.action.afterSnapshot as { conflictSuggestions?: ScheduleConflictSuggestion[] }).conflictSuggestions;
  const move = suggestions && suggestions.find((suggestion) => suggestion.action.type === "move_item");
  assert.ok(move);
  if (!move || move.action.type !== "move_item") assert.fail("expected local move suggestion");

  const revised = evaluateScheduleDraftRevision({
    intent: answerIntent,
    pendingAction,
    referenceDate: context.now,
    sessionState: makeScheduleDraftSession(),
    userMessage: scheduleConflictSuggestionToUserMessage(move),
  });

  assert.equal(revised.status, "revised");
  if (revised.status !== "revised") assert.fail("expected revised draft");
  assert.equal(revised.pendingAction, null);
  assert.equal(revised.schedulingDraft.items[0]?.date, "2026-06-30");
  assert.equal(revised.schedulingDraft.items[0]?.startTime, "21:00");
  assert.equal(revised.schedulingDraft.items[0]?.endTime, "22:00");
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );

  const prepared = evaluateScheduleCreationPreparation({
    intent: answerIntent,
    sessionState: revised.sessionState,
    userMessage: "就按这个日程草案创建日程",
  });

  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") assert.fail("expected prepared creation");
  const second = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: prepared.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: payload as never,
    persistAgentTurn: async ({ nextPendingAction }) => makeThread(nextPendingAction),
    pushTrace: () => undefined,
    resolution: {
      engine: "heuristic",
      intent: prepared.intent,
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  assert.equal(second.outcome, "early_exit");
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "find" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    true,
  );
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );
});
