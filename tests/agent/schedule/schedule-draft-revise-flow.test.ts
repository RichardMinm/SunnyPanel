import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import { evaluateScheduleDraftRevision } from "../../../src/lib/agent/schedule/revise-draft-flow";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
  ProposedAgentAction,
} from "../../../src/lib/agent/schemas";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import type { AgentThread } from "../../../src/payload-types";
import {
  getPayloadStubOperations,
  resetPayloadStub,
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

const makeScheduleDraftSession = (): AgentSessionState => ({
  conversation: { lastTopic: "SunnyPanel 上线日程" },
  pending: {},
  schemaVersion: 1,
  semantic: {
    currentTarget: { entityType: "schedule", topic: "SunnyPanel 上线日程" },
    domain: "schedule",
    stage: "drafting",
    workflow: "schedule_composition",
  },
  scheduling: {
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
  },
  updatedAt: "2026-06-29T00:00:00.000Z",
});

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
    args: {},
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

test("schedule draft revision updates conflicting draft item without pending action", () => {
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    pendingAction: makePendingAction(),
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    sessionState: makeScheduleDraftSession(),
    userMessage: "把冲突的改到明天下午",
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised result");
  assert.equal(result.pendingAction, null);
  assert.equal(result.schedulingDraft.items[1]?.date, "2026-06-30");
  assert.equal(result.schedulingDraft.items[1]?.startTime, "14:00");
  assert.equal(result.sessionState.scheduling?.draft?.items[0]?.date, "2026-06-29");
  assert.equal(result.sessionState.pending.confirmation, null);
  assert.equal(result.sessionState.conversation.lastUserIntent, "revise_schedule_draft");
  assert.match(result.assistantMessage, /尚未写入日程/);
  assert.match(result.assistantMessage, /准备创建时会重新检查冲突/);
});

test("needs clarification keeps original draft and creates no pending action", () => {
  const session = makeScheduleDraftSession();
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    sessionState: session,
    userMessage: "把“缺失任务”改到明天上午",
  });

  assert.equal(result.status, "needs_clarification");
  if (result.status !== "needs_clarification") assert.fail("expected clarification");
  assert.equal(result.pendingAction, null);
  assert.deepEqual(result.sessionState.scheduling?.draft, session.scheduling?.draft);
  assert.match(result.assistantMessage, /没有找到|具体是哪一个/);
});

test("allow-overlap revision updates scheduling slots conflictPolicy", () => {
  const result = evaluateScheduleDraftRevision({
    intent: answerIntent,
    sessionState: makeScheduleDraftSession(),
    userMessage: "允许重叠，冲突也没关系",
  });

  assert.equal(result.status, "revised");
  if (result.status !== "revised") assert.fail("expected revised result");
  assert.equal(result.sessionState.scheduling?.slots?.conflictPolicy, "allow-overlap");
  assert.ok(result.schedulingDraft.assumptions?.some((item) => /允许重叠/.test(item)));
});

test("LangGraph revise_schedule_draft returns draft response without dry-run or execute", async () => {
  resetPayloadStub();
  let dryRunCalled = false;
  let executeCalled = false;
  let capturedConversationState: unknown = null;
  const trace: AgentTraceStep[] = [];
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
        sessionId: "revise-schedule-draft",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("revise_schedule_draft should not enter dry-run");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("revise_schedule_draft should not execute");
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
      finalizeTurn: async ({ conversationStateOverride, response }) => {
        capturedConversationState = conversationStateOverride;
        return {
          ...response,
          threadId: 8841,
        };
      },
      generateIntentWithAgentModel: async () => null,
      intentModelEngine: "heuristic",
      message: "把冲突的改到明天下午",
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

  const response = await run(
    () => undefined,
    (step) => trace.push(step),
  );

  assert.equal(dryRunCalled, false);
  assert.equal(executeCalled, false);
  assert.equal(response.pendingAction, null);
  assert.equal(response.schedulingDraft?.items[1]?.date, "2026-06-30");
  assert.match(response.assistantMessage, /尚未写入日程/);
  assert.match(response.assistantMessage, /准备创建时会重新检查冲突/);
  assert.ok(trace.some((step) => step.id === "revise-schedule-draft"));
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );
  assert.equal((capturedConversationState as AgentSessionState | null)?.scheduling?.draft?.items[1]?.date, "2026-06-30");
});
