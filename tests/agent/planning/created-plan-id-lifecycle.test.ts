import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { runExecuteAndPersistStep } from "../../../src/lib/agent/chat-pipeline/execute-and-persist-step";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import type { AgentChatResponse } from "../../../src/lib/agent/schemas";
import { createDefaultSessionState, normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";
import {
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

const createPlanArgs = {
  description: "从计划草案创建。",
  dueDate: "2026-06-30",
  priority: "high" as const,
  title: "SunnyPanel 第一版上线计划",
};

const makePlanningSession = (): AgentSessionState => ({
  ...createDefaultSessionState(),
  semantic: {
    domain: "planning",
    stage: "confirming",
    currentTarget: {
      entityType: "plan",
      topic: "SunnyPanel 第一版上线",
    },
    workflow: "plan_creation",
  },
  planning: {
    draft: {
      availableTime: "每天 2 小时",
      currentProgress: "登录已完成",
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话、部署",
      stages: [
        {
          tasks: ["修复登录页", "完成部署检查"],
          title: "上线收尾",
        },
      ],
      successCriteria: "内测可用",
      title: "SunnyPanel 第一版上线计划草案",
    },
    workflow: "plan_creation",
  },
});

beforeEach(() => {
  resetPayloadStub();
});

const installPlanCreateStub = (planId = 321) => {
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "plans") {
      return {
        createdAt: "2026-07-01T00:00:00.000Z",
        id: planId,
        updatedAt: "2026-07-01T00:00:00.000Z",
        visibility: "private",
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 9001,
        ...args.data,
      };
    }

    throw new Error(`unexpected collection ${args.collection}`);
  });
};

test("create_plan execute returns createdPlanId and planId", async () => {
  installPlanCreateStub(321);

  const result = await executeAgentIntent(
    {
      args: createPlanArgs,
      intent: "create_plan",
    },
    undefined,
    { userId: 7 },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.createdPlanId, 321);
  assert.equal(result.planId, 321);
  assert.match(result.assistantMessage, /已帮你创建计划/);
});

test("execute success backfills planning sourcePlanId and draft sourcePlanId", async () => {
  installPlanCreateStub(432);
  let persistedConversationState: unknown = null;

  await runExecuteAndPersistStep({
    confirmedActionId: null,
    conversationState: makePlanningSession(),
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executionApproved: true,
    isDirectAnswer: false,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
      persistedConversationState = conversationState;

      return {
        id: 990,
        conversationState,
        pendingAction: nextPendingAction,
      } as never;
    },
    pushTrace: () => undefined,
    resolution: {
      engine: "workflow",
      intent: {
        args: createPlanArgs,
        confidence: 0.93,
        intent: "create_plan",
      },
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  const session = normalizeSessionState(persistedConversationState);

  assert.equal(session.semantic.domain, "planning");
  assert.equal(session.semantic.workflow, "plan_creation");
  assert.equal(session.semantic.stage, "completed");
  assert.equal(session.planning?.sourcePlanId, 432);
  assert.equal(session.planning?.draft?.sourcePlanId, 432);
});

test("confirmed pending create_plan execution backfills planning sourcePlanId", async () => {
  installPlanCreateStub(543);
  let persistedConversationState: unknown = null;

  await runExecuteAndPersistStep({
    confirmedActionId: "confirm-create-plan",
    conversationState: makePlanningSession(),
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executionApproved: false,
    isDirectAnswer: false,
    pendingAction: {
      action: {
        args: createPlanArgs,
        changes: [
          {
            collection: "plans",
            operation: "create",
            preview: "创建计划",
          },
        ],
        id: "confirm-create-plan",
        intent: "create_plan",
        requiresConfirmation: true,
        riskLevel: "medium",
        summary: "创建计划",
      },
      type: "await_confirmation",
    },
    persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
      persistedConversationState = conversationState;

      return {
        id: 993,
        conversationState,
        pendingAction: nextPendingAction,
      } as never;
    },
    pushTrace: () => undefined,
    resolution: {
      engine: "workflow",
      intent: {
        args: createPlanArgs,
        confidence: 0.93,
        intent: "create_plan",
      },
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  const session = normalizeSessionState(persistedConversationState);

  assert.equal(session.planning?.sourcePlanId, 543);
  assert.equal(session.planning?.draft?.sourcePlanId, 543);
});

test("dry-run style persistence does not backfill sourcePlanId before execution", () => {
  const session = normalizeSessionState(makePlanningSession());

  assert.equal(session.planning?.sourcePlanId, undefined);
  assert.equal(session.planning?.draft?.sourcePlanId, undefined);
});

test("execute failure does not backfill planning sourcePlanId", async () => {
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string };

    if (args.collection === "plans") {
      throw new Error("plan create failed");
    }

    return { id: 9001 };
  });
  let persistedConversationState: unknown = null;

  await assert.rejects(
    runExecuteAndPersistStep({
      confirmedActionId: null,
      conversationState: makePlanningSession(),
      emitStatus: () => undefined,
      emitToken: () => undefined,
      executionApproved: true,
      isDirectAnswer: false,
      persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
        persistedConversationState = conversationState;

        return {
          id: 991,
          conversationState,
          pendingAction: nextPendingAction,
        } as never;
      },
      pushTrace: () => undefined,
      resolution: {
        engine: "workflow",
        intent: {
          args: createPlanArgs,
          confidence: 0.93,
          intent: "create_plan",
        },
      },
      tokenUsage,
      trace: [],
      user: { id: 7 },
    }),
    /plan create failed/,
  );

  assert.equal(persistedConversationState, null);
});

test("non-planning create_plan execution does not force planning sourcePlanId", async () => {
  installPlanCreateStub(654);
  let persistedConversationState: unknown = null;
  const nonPlanningSession = createDefaultSessionState();

  await runExecuteAndPersistStep({
    confirmedActionId: null,
    conversationState: nonPlanningSession,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    executionApproved: true,
    isDirectAnswer: false,
    persistAgentTurn: async ({ conversationState, nextPendingAction }) => {
      persistedConversationState = conversationState;

      return {
        id: 992,
        conversationState,
        pendingAction: nextPendingAction,
      } as never;
    },
    pushTrace: () => undefined,
    resolution: {
      engine: "workflow",
      intent: {
        args: {
          title: "今晚修复登录页",
        },
        confidence: 0.9,
        intent: "create_plan",
      },
    },
    tokenUsage,
    trace: [],
    user: { id: 7 },
  });

  const session = normalizeSessionState(persistedConversationState);

  assert.equal(session.planning?.sourcePlanId, undefined);
  assert.equal(session.planning?.draft?.sourcePlanId, undefined);
});
