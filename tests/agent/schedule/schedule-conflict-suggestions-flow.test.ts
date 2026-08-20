import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import {
  scheduleConflictSuggestionToUserMessage,
  type ScheduleConflictSuggestion,
} from "../../../src/lib/agent/schedule/conflict-suggestions";
import { evaluateScheduleDraftRevision } from "../../../src/lib/agent/schedule/revise-draft-flow";
import type {
  AgentChatResponse,
  AgentIntent,
  CreateScheduleItemsArgs,
  PendingAction,
  ProposedAgentAction,
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
  now: "2026-06-29T00:00:00.000+08:00",
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
      date: "2026-06-29",
      endTime: "22:00",
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-login",
      relatedPlanId: 99,
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-29",
      endTime: "22:30",
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-deploy",
      relatedPlanId: 99,
      startTime: "21:30",
      title: "部署验证",
    },
  ],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceText: "从日程草案准备创建正式日程。",
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
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
          date: "2026-06-29",
          endTime: "22:00",
          sourceChecklistItemKey: "item-login",
          startTime: "20:00",
          title: "修复登录页",
        },
        {
          date: "2026-06-29",
          endTime: "22:30",
          sourceChecklistItemKey: "item-deploy",
          startTime: "21:30",
          title: "部署验证",
        },
      ],
      nextActions: ["调整时间", "就按这个创建日程"],
      sourceChecklistId: 12,
      sourcePlanId: 99,
      sourceType: "checklist",
      title: "清单日程草案：2 项任务",
    },
    slots: {
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
  updatedAt: "2026-06-29T00:00:00.000Z",
});

const allowSuggestion: ScheduleConflictSuggestion = {
  action: { type: "allow_overlap" },
  description: "只记录允许重叠；准备创建时会再次检查真实冲突。",
  id: "allow-overlap",
  label: "允许重叠并继续",
  riskLevel: "medium",
};

const removeSuggestion: ScheduleConflictSuggestion = {
  action: { itemTitle: "部署验证", type: "remove_item" },
  description: "只是从草案移除，不删除真实日程项。",
  id: "remove-item-部署验证",
  label: "暂不安排部署验证",
  riskLevel: "low",
};

const moveSuggestion: ScheduleConflictSuggestion = {
  action: {
    date: "2026-06-30",
    endTime: "17:00",
    itemTitle: "部署验证",
    startTime: "14:00",
    type: "move_item",
  },
  description: "该建议尚未重新检查真实冲突。",
  id: "move-item-部署验证-2026-06-30-14:00-17:00",
  label: "改到 2026-06-30 14:00-17:00",
  riskLevel: "low",
};

const makePendingAction = (): PendingAction => ({
  action: {
    affectedDocuments: [
      {
        collection: "schedule-items",
        operation: "create",
        visibility: "private",
      },
    ],
    afterSnapshot: {
      conflictSuggestions: [allowSuggestion, removeSuggestion, moveSuggestion],
      conflictSummary: {
        conflictCount: 1,
        conflictPolicy: "ask",
        existingScheduleChecked: true,
        message: "发现 1 个时间冲突。系统不会自动重排，请确认是否仍要写入日程。",
        warningCount: 0,
      },
      scheduleConflicts: [
        {
          existingScheduleItemId: 501,
          existingTitle: "已有发布会",
          message: "「部署验证」与已有日程「已有发布会」时间重叠。",
          proposedDate: "2026-06-29",
          proposedEndTime: "22:30",
          proposedStartTime: "21:30",
          proposedTitle: "部署验证",
          severity: "warning",
          type: "existing",
        },
      ],
    },
    args: createScheduleItemsArgs(),
    beforeSnapshot: null,
    changes: [],
    id: "action-create-schedule-items-conflict",
    intent: "create_schedule_items",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollbackAvailable: true,
    summary: "创建 2 个日程项",
  } satisfies ProposedAgentAction,
  type: "await_confirmation",
});

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 8841,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

test("create_schedule_items dry-run adds conflict suggestions to proposed action", async () => {
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: null,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {} as never,
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

  assert.ok(snapshot?.conflictSuggestions?.some((suggestion) => suggestion.action.type === "allow_overlap"));
  assert.ok(snapshot?.conflictSuggestions?.some((suggestion) => suggestion.action.type === "remove_item"));
  assert.ok(snapshot?.conflictSuggestions?.some((suggestion) => suggestion.action.type === "manual_adjust"));
});

test("dry-run suggestion generation reads existing schedule-items without writing", async () => {
  resetPayloadStub();
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };
    if (args.collection !== "schedule-items") return { docs: [], totalDocs: 0 };

    return {
      docs: [
        {
          date: "2026-06-29",
          endTime: "22:00",
          id: 501,
          isAllDay: false,
          startTime: "21:00",
          status: "planned",
          title: "已有发布会",
        },
      ],
      totalDocs: 1,
    };
  });

  const payload = await getPayloadClient();
  await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: null,
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

  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );
});

test("selecting allow overlap suggestion reuses L2 and updates conflict policy", () => {
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    pendingAction: makePendingAction(),
    sessionState: makeScheduleDraftSession(),
    userMessage: scheduleConflictSuggestionToUserMessage(allowSuggestion),
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised");
  assert.equal(result.pendingAction, null);
  assert.equal(result.sessionState.scheduling?.slots?.conflictPolicy, "allow-overlap");
});

test("selecting remove item suggestion reuses L2 and removes draft item", () => {
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    pendingAction: makePendingAction(),
    sessionState: makeScheduleDraftSession(),
    userMessage: scheduleConflictSuggestionToUserMessage(removeSuggestion),
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised");
  assert.equal(result.pendingAction, null);
  assert.deepEqual(result.schedulingDraft.items.map((item) => item.title), ["修复登录页"]);
});

test("selecting move item suggestion reuses L2 and updates draft time", () => {
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    pendingAction: makePendingAction(),
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    sessionState: makeScheduleDraftSession(),
    userMessage: scheduleConflictSuggestionToUserMessage(moveSuggestion),
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised");
  assert.equal(result.pendingAction, null);
  assert.equal(result.schedulingDraft.items[1]?.date, "2026-06-30");
  assert.equal(result.schedulingDraft.items[1]?.startTime, "14:00");
  assert.equal(result.schedulingDraft.items[1]?.endTime, "17:00");
  assert.match(result.assistantMessage, /准备创建时会重新检查冲突/);
});

test("LangGraph suggestion selection returns draft response without dry-run or executor", async () => {
  resetPayloadStub();
  let dryRunCalled = false;
  let executeCalled = false;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) => ({
      ...makeThread(pendingAction),
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
        sessionId: "schedule-conflict-suggestion",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("suggestion selection should not enter dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("suggestion selection should not execute");
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
      finalizeTurn: async ({ response }) => ({
        ...response,
        threadId: 8841,
      }),
      message: scheduleConflictSuggestionToUserMessage(moveSuggestion),
      payload: {} as never,
      pendingAction: makePendingAction(),
      resolvedHistory: [],
      structuredConfirmation: null,
      thread: makeThread(makePendingAction()),
      user: { id: 7 },
      userPreferences: null,
    },
    steps,
    {
      checkpointer: new MemorySaver(),
    },
  );

  const response = await run();

  assert.equal(dryRunCalled, false);
  assert.equal(executeCalled, false);
  assert.equal(response.pendingAction, null);
  assert.equal(response.schedulingDraft?.items[1]?.date, "2026-06-30");
});
