import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../../src/lib/agent/action-receipts";
import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { runExecuteAndPersistStep } from "../../../src/lib/agent/chat-pipeline/execute-and-persist-step";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { evaluateChecklistDraftGeneration } from "../../../src/lib/agent/planning/checklist-draft-flow";
import { evaluateChecklistCreationPreparation } from "../../../src/lib/agent/planning/prepare-checklist-creation";
import { evaluatePlanCreationPreparation } from "../../../src/lib/agent/planning/prepare-plan-creation";
import { evaluatePlanReadinessGate } from "../../../src/lib/agent/planning/readiness-gate";
import { evaluatePlanDraftRevision } from "../../../src/lib/agent/planning/revise-plan-draft";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  CreateChecklistArgs,
  CreatePlanArgs,
  PendingAction,
} from "../../../src/lib/agent/schemas";
import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";
import { createChecklistFromIntent } from "../../../src/lib/agent/tools/checklist-create";
import type { AgentThread, Plan } from "../../../src/payload-types";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

type LinkedContent = NonNullable<Plan["linkedContent"]>;

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
  now: "2026-06-29T20:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const makeThread = (
  id: number,
  pendingAction: null | PendingAction = null,
  conversationState?: unknown,
): AgentThread => ({
  conversationState,
  id,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const makeResolution = (intent: AgentIntent) => ({
  engine: "workflow" as const,
  intent,
});

const getCreateCount = (collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === collection,
  ).length;

const getUpdateCount = (collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === "update" &&
      (operation.args as { collection?: string }).collection === collection,
  ).length;

const getDeleteCount = (collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === "delete" &&
      (operation.args as { collection?: string }).collection === collection,
  ).length;

const createMemoryReceiptStore = (): AgentActionReceiptStore => {
  const responsesByKey = new Map<string, unknown>();
  const receiptKeysById = new Map<number, string>();
  let nextReceiptId = 1;

  return {
    claim: async (input) => {
      if (responsesByKey.has(input.key)) {
        return {
          response: responsesByKey.get(input.key),
          status: "replay",
        };
      }

      const receiptId = nextReceiptId;
      nextReceiptId += 1;
      receiptKeysById.set(receiptId, input.key);

      return {
        receiptId,
        status: "claimed",
      };
    },
    complete: async (receiptId, response) => {
      const key = receiptKeysById.get(receiptId);

      if (key) {
        responsesByKey.set(key, response);
      }
    },
    markIndeterminate: async () => undefined,
  };
};

beforeEach(() => {
  resetPayloadStub();
});

test("planning workflow clarifies, drafts, confirms, creates linked checklist, and rolls it back", async () => {
  const planId = 1001;
  const checklistId = 2001;
  let nextAgentRunId = 9001;
  let linkedContent: LinkedContent = [{ relationTo: "posts", value: 11 }];
  const deletedChecklistIds: number[] = [];

  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "plans" && args.id === planId) {
      return {
        id: planId,
        linkedContent,
        title: "SunnyPanel 第一版上线计划",
      };
    }

    return null;
  });
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "plans") {
      return {
        createdAt: "2026-07-01T00:00:00.000Z",
        id: planId,
        priority: "medium",
        state: "backlog",
        updatedAt: "2026-07-01T00:00:00.000Z",
        visibility: "private",
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "checklists") {
      return {
        createdAt: "2026-07-01T00:00:00.000Z",
        id: checklistId,
        updatedAt: "2026-07-01T00:00:00.000Z",
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      const id = nextAgentRunId;
      nextAgentRunId += 1;

      return {
        id,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });
  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: { linkedContent?: LinkedContent }; id?: number };

    if (args.collection === "plans" && args.id === planId && args.data?.linkedContent) {
      linkedContent = args.data.linkedContent;

      return {
        id: planId,
        linkedContent,
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });
  setPayloadStubDeleteHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "checklists" && typeof args.id === "number") {
      deletedChecklistIds.push(args.id);

      return { id: args.id };
    }

    throw new Error(`unexpected delete collection ${args.collection ?? "unknown"}`);
  });

  const initialMessage = "帮我计划 SunnyPanel 第一版 6月30日前上线";
  const initialGate = evaluatePlanReadinessGate({
    intent: {
      args: {
        goal: "SunnyPanel 第一版上线",
        sourceText: initialMessage,
        suggestedDueDate: "2026-06-30",
      },
      confidence: 0.86,
      intent: "compose_plan",
    },
    userMessage: initialMessage,
  });

  assert.equal(initialGate.gateApplied, true);
  if (!initialGate.gateApplied) assert.fail("expected readiness gate to clarify");
  assert.equal(initialGate.readiness.status, "insufficient");
  assert.equal(initialGate.pendingAction, null);
  assert.ok(initialGate.readiness.suggestedQuestions.length > 0);
  assert.ok(initialGate.readiness.suggestedQuestions.length <= 5);
  assert.equal(initialGate.sessionState.planning?.slots?.goal, "SunnyPanel 第一版上线");
  assert.equal(initialGate.sessionState.planning?.slots?.deadline, "2026-06-30");

  const slotMessage =
    "第一版范围包含写作、计划、Agent 对话和基础部署；当前写作页基本完成，Agent 主流程还要收尾；6月30日前每天能投入 4 小时；上线标准是内测可用并包含测试、部署、文档整理。";
  const slotGate = evaluatePlanReadinessGate({
    intent: {
      args: {
        answer: slotMessage,
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.84,
      intent: "answer_question",
    },
    sessionState: initialGate.sessionState,
    userMessage: slotMessage,
  });

  assert.equal(slotGate.gateApplied, true);
  if (!slotGate.gateApplied) assert.fail("expected planning slot follow-up");
  assert.equal(slotGate.readiness.status, "draftable");
  assert.equal(slotGate.pendingAction, null);
  assert.equal(slotGate.sessionState.planning?.slots?.currentProgress, "当前写作页基本完成，Agent 主流程还要收尾");

  const draftGate = evaluatePlanReadinessGate({
    intent: {
      args: {
        answer: "请先给我一版计划草案",
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.84,
      intent: "answer_question",
    },
    sessionState: slotGate.sessionState,
    userMessage: "请先给我一版计划草案",
  });

  assert.equal(draftGate.gateApplied, true);
  if (!draftGate.gateApplied) assert.fail("expected plan draft generation");
  assert.equal(draftGate.pendingAction, null);
  assert.ok(draftGate.planningDraft);
  assert.equal(draftGate.sessionState.planning?.draft?.goal, "SunnyPanel 第一版上线");

  const revision = evaluatePlanDraftRevision({
    intent: {
      args: {
        answer: "加上测试和部署阶段",
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.86,
      intent: "answer_question",
    },
    sessionState: draftGate.sessionState,
    userMessage: "加上测试和部署阶段",
  });

  assert.equal(revision.status, "revised");
  if (revision.status !== "revised") assert.fail("expected plan draft revision");
  assert.equal(revision.pendingAction, null);
  assert.match(
    revision.planningDraft.stages.map((stage) => stage.title).join(" "),
    /测试|部署/,
  );

  const planPreparation = evaluatePlanCreationPreparation({
    intent: {
      args: {
        answer: "就按这个草案创建计划",
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.9,
      intent: "answer_question",
    },
    sessionState: revision.sessionState,
    userMessage: "就按这个草案创建计划",
  });

  assert.equal(planPreparation.status, "prepared");
  if (planPreparation.status !== "prepared") assert.fail("expected plan creation preparation");
  assert.equal(planPreparation.sessionState.semantic.stage, "confirming");

  const planDryRunTrace: AgentTraceStep[] = [];
  const planDryRun = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: planPreparation.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: await getPayloadClient() as never,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) =>
      makeThread(3001, nextPendingAction, conversationState),
    pushTrace: (step) => {
      planDryRunTrace.push(step);
    },
    resolution: makeResolution(planPreparation.intent),
    tokenUsage,
    trace: planDryRunTrace,
    user: { id: 7 },
  });

  assert.equal(planDryRun.outcome, "early_exit");
  if (planDryRun.outcome !== "early_exit") assert.fail("expected plan pending confirmation");
  assert.equal(planDryRun.response.pendingAction?.type, "await_confirmation");
  assert.equal(planDryRun.response.pendingAction?.action.intent, "compose_plan");
  assert.equal(getCreateCount("plans"), 0);
  assert.match(planDryRun.response.assistantMessage, /确认|执行/);

  const planPending = planDryRun.response.pendingAction;
  if (!planPending || planPending.type !== "await_confirmation") {
    assert.fail("expected plan confirmation pending action");
  }

  let persistedAfterPlan: unknown = null;
  const planExecuteTrace: AgentTraceStep[] = [];
  await runExecuteAndPersistStep({
    confirmedActionId: planPending.action.id,
    conversationState: planPreparation.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executionApproved: true,
    isDirectAnswer: false,
    pendingAction: planPending,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
      persistedAfterPlan = conversationState;

      return makeThread(3002, nextPendingAction, conversationState);
    },
    pushTrace: (step) => {
      planExecuteTrace.push(step);
    },
    resolution: makeResolution(planPreparation.intent),
    tokenUsage,
    trace: planExecuteTrace,
    user: { id: 7 },
  });

  assert.equal(getCreateCount("plans"), 1);
  const planSession = normalizeSessionState(persistedAfterPlan);
  assert.equal(planSession.planning?.sourcePlanId, planId);
  assert.equal(planSession.planning?.draft?.sourcePlanId, planId);

  const checklistDraftGeneration = evaluateChecklistDraftGeneration({
    intent: {
      args: {
        answer: "请把这个计划拆成清单草案",
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.87,
      intent: "answer_question",
    },
    sessionState: planSession,
    userMessage: "请把这个计划拆成清单草案",
  });

  assert.equal(checklistDraftGeneration.status, "generated");
  if (checklistDraftGeneration.status !== "generated") assert.fail("expected checklist draft");
  assert.equal(checklistDraftGeneration.pendingAction, null);
  assert.equal(checklistDraftGeneration.planningChecklistDraft.sourcePlanId, planId);

  const checklistPreparation = evaluateChecklistCreationPreparation({
    intent: {
      args: {
        answer: "就按这个清单草案创建清单",
        openDomainTopic: "SunnyPanel 第一版上线",
      },
      confidence: 0.9,
      intent: "answer_question",
    },
    sessionState: checklistDraftGeneration.sessionState,
    userMessage: "就按这个清单草案创建清单",
  });

  assert.equal(checklistPreparation.status, "prepared");
  if (checklistPreparation.status !== "prepared") assert.fail("expected checklist creation preparation");
  assert.equal(checklistPreparation.intent.args.sourcePlanId, planId);

  const checklistDryRunTrace: AgentTraceStep[] = [];
  const checklistDryRun = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: checklistPreparation.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: await getPayloadClient() as never,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) =>
      makeThread(3003, nextPendingAction, conversationState),
    pushTrace: (step) => {
      checklistDryRunTrace.push(step);
    },
    resolution: makeResolution(checklistPreparation.intent),
    tokenUsage,
    trace: checklistDryRunTrace,
    user: { id: 7 },
  });

  assert.equal(checklistDryRun.outcome, "early_exit");
  if (checklistDryRun.outcome !== "early_exit") assert.fail("expected checklist pending confirmation");
  assert.equal(checklistDryRun.response.pendingAction?.type, "await_confirmation");
  assert.equal(checklistDryRun.response.pendingAction?.action.intent, "create_checklist");
  assert.equal(getCreateCount("checklists"), 0);

  const checklistPending = checklistDryRun.response.pendingAction;
  if (!checklistPending || checklistPending.type !== "await_confirmation") {
    assert.fail("expected checklist confirmation pending action");
  }

  let persistedAfterChecklist: unknown = null;
  const checklistExecuteTrace: AgentTraceStep[] = [];
  const checklistExecution = await runExecuteAndPersistStep({
    confirmedActionId: checklistPending.action.id,
    conversationState: checklistPreparation.sessionState,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executionApproved: true,
    isDirectAnswer: false,
    pendingAction: checklistPending,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
      persistedAfterChecklist = conversationState;

      return makeThread(3004, nextPendingAction, conversationState);
    },
    pushTrace: (step) => {
      checklistExecuteTrace.push(step);
    },
    resolution: makeResolution(checklistPreparation.intent),
    tokenUsage,
    trace: checklistExecuteTrace,
    user: { id: 7 },
  });

  assert.equal(getCreateCount("checklists"), 1);
  assert.equal(getUpdateCount("plans"), 1);
  assert.deepEqual(linkedContent, [
    { relationTo: "posts", value: 11 },
    { relationTo: "checklists", value: checklistId },
  ]);
  assert.ok(checklistExecution.lastRollbackPayload);
  assert.equal(normalizeSessionState(persistedAfterChecklist).planning?.checklistDraft?.sourcePlanId, planId);

  linkedContent = [
    ...linkedContent,
    { relationTo: "notes", value: 44 },
  ];

  const rollbackResult = await executeRollbackFromPayload(
    checklistExecution.lastRollbackPayload,
    {
      payload: await getPayloadClient() as never,
      persistAudit: false,
    },
  );

  assert.equal(rollbackResult.strategy, "delete_created_checklist_and_restore_plan_links");
  assert.deepEqual(deletedChecklistIds, [checklistId]);
  assert.equal(getDeleteCount("checklists"), 1);
  assert.deepEqual(linkedContent, [
    { relationTo: "posts", value: 11 },
    { relationTo: "notes", value: 44 },
  ]);
});

test("action receipt replay prevents duplicate plan and checklist creation", async () => {
  let nextAgentRunId = 9101;
  let nextPlanId = 3101;
  let nextChecklistId = 4101;
  let linkedContent: LinkedContent = [];

  setPayloadStubFindHandler(async () => ({ docs: [], totalDocs: 0 }));
  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "plans" && args.id === 3101) {
      return {
        id: 3101,
        linkedContent,
        title: "SunnyPanel 第一版上线计划",
      };
    }

    return null;
  });
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "plans") {
      const id = nextPlanId;
      nextPlanId += 1;

      return {
        id,
        priority: "medium",
        state: "backlog",
        visibility: "private",
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "checklists") {
      const id = nextChecklistId;
      nextChecklistId += 1;

      return {
        id,
        visibility: "private",
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      const id = nextAgentRunId;
      nextAgentRunId += 1;

      return {
        id,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });
  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: { linkedContent?: LinkedContent }; id?: number };

    if (args.collection === "plans" && args.id === 3101 && args.data?.linkedContent) {
      linkedContent = args.data.linkedContent;

      return {
        id: 3101,
        linkedContent,
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });

  const store = createMemoryReceiptStore();
  const createPlanArgs: CreatePlanArgs = {
    description: "从计划草案创建。",
    dueDate: "2026-06-30",
    priority: "high",
    title: "SunnyPanel 第一版上线计划",
  };
  const planExecute = () =>
    executeAgentIntent(
      {
        args: createPlanArgs,
        intent: "create_plan",
      },
      undefined,
      { userId: 7 },
    );
  const firstPlan = await runIdempotentAgentAction({
    actionId: "confirm-plan-once",
    execute: planExecute,
    intent: "create_plan",
    store,
    threadId: 77,
    userId: 7,
  });
  const replayedPlan = await runIdempotentAgentAction({
    actionId: "confirm-plan-once",
    execute: planExecute,
    intent: "create_plan",
    store,
    threadId: 77,
    userId: 7,
  });

  assert.deepEqual(replayedPlan, firstPlan);
  assert.equal(firstPlan.createdPlanId, 3101);
  assert.equal(getCreateCount("plans"), 1);

  const createChecklistArgs: CreateChecklistArgs = {
    groups: [
      {
        items: [
          {
            description: null,
            isCompleted: false,
            title: "完成上线回归测试",
          },
        ],
        title: "测试与部署",
      },
    ],
    sourcePlanId: 3101,
    sourceText: "从清单草案创建。",
    title: "SunnyPanel 第一版上线任务清单",
  };
  const checklistExecute = () =>
    createChecklistFromIntent(createChecklistArgs, undefined, { userId: 7 });
  const firstChecklist = await runIdempotentAgentAction({
    actionId: "confirm-checklist-once",
    execute: checklistExecute,
    intent: "create_checklist",
    store,
    threadId: 77,
    userId: 7,
  });
  const replayedChecklist = await runIdempotentAgentAction({
    actionId: "confirm-checklist-once",
    execute: checklistExecute,
    intent: "create_checklist",
    store,
    threadId: 77,
    userId: 7,
  });

  assert.deepEqual(replayedChecklist, firstChecklist);
  assert.equal(firstChecklist.checklistId, 4101);
  assert.equal(firstChecklist.linkedPlanId, 3101);
  assert.equal(getCreateCount("checklists"), 1);
  assert.equal(getUpdateCount("plans"), 1);
  assert.deepEqual(linkedContent, [{ relationTo: "checklists", value: 4101 }]);
});
