import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  CreateScheduleItemsArgs,
  PendingAction,
} from "../../../src/lib/agent/schemas";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
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

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 8811,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

const createScheduleItemsArgs = (
  overrides: Partial<CreateScheduleItemsArgs> = {},
): CreateScheduleItemsArgs => ({
  conflictPolicy: "ask",
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      isAllDay: false,
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-login",
      relatedPlanId: 99,
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-29",
      endTime: "22:30",
      isAllDay: false,
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-docs",
      relatedPlanId: 99,
      startTime: "21:30",
      title: "整理发布文档",
    },
  ],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceText: "从日程草案准备创建正式日程。",
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
  ...overrides,
});

const createScheduleItemsIntent = (
  args: CreateScheduleItemsArgs = createScheduleItemsArgs(),
): Extract<AgentIntent, { intent: "create_schedule_items" }> => ({
  args,
  confidence: 0.91,
  intent: "create_schedule_items",
});

const getSnapshot = (value: unknown) => value as {
  conflictSummary?: {
    conflictCount: number;
    conflictPolicy?: null | string;
    existingScheduleChecked: boolean;
    message: string;
  };
  scheduleConflicts?: Array<{
    existingScheduleItemId?: null | number | string;
    message: string;
    type: string;
  }>;
};

beforeEach(() => {
  resetPayloadStub();
});

test("create_schedule_items dry-run attaches conflict awareness without changing create args", async () => {
  const calls: unknown[] = [];
  const args = createScheduleItemsArgs({ conflictPolicy: "ask" });
  const result = await dryRunAgentIntent(createScheduleItemsIntent(args), {
    createActionId: () => "action-create-schedule-items-conflicts",
    detectScheduleConflicts: async (input) => {
      calls.push(input);
      if (input.date !== "2026-06-29") return [];

      return [
        {
          endTime: "21:00",
          id: 501,
          startTime: "20:30",
          title: "已有发布会",
        },
      ];
    },
  });

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") assert.fail("expected proposed action");
  const snapshot = getSnapshot(result.action.afterSnapshot);
  assert.equal(snapshot.conflictSummary?.existingScheduleChecked, true);
  assert.equal(snapshot.conflictSummary?.conflictPolicy, "ask");
  assert.ok((snapshot.scheduleConflicts?.length ?? 0) >= 2);
  assert.ok(snapshot.scheduleConflicts?.some((item) => item.type === "internal"));
  assert.ok(snapshot.scheduleConflicts?.some((item) => item.existingScheduleItemId === 501));
  assert.match(result.action.changes[0]?.afterPreview ?? "", /发现 \d+ 个时间冲突/);
  assert.match(result.action.changes[0]?.afterPreview ?? "", /系统不会自动重排/);
  assert.match(result.action.changes[0]?.preview ?? "", /确认后才会写入日程/);
  assert.deepEqual(result.action.args, args);
  assert.equal(calls.length, 2);
});

test("create_schedule_items dry-run shows no-conflict local schedule note when no conflicts are found", async () => {
  const result = await dryRunAgentIntent(createScheduleItemsIntent(createScheduleItemsArgs({
    items: [
      {
        date: "2026-06-29",
        endTime: "22:00",
        startTime: "20:00",
        title: "修复登录页",
      },
      {
        date: "2026-06-30",
        endTime: "11:00",
        startTime: "09:00",
        title: "整理发布文档",
      },
    ],
  })), {
    detectScheduleConflicts: async () => [],
  });

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") assert.fail("expected proposed action");
  const snapshot = getSnapshot(result.action.afterSnapshot);
  assert.deepEqual(snapshot.scheduleConflicts, []);
  assert.match(result.action.changes[0]?.afterPreview ?? "", /未发现明显时间冲突/);
  assert.match(result.action.changes[0]?.afterPreview ?? "", /未包含外部日历/);
});

test("conflictPolicy display does not skip or reschedule items in L1", async () => {
  for (const conflictPolicy of ["allow-overlap", "skip", "reschedule"] as const) {
    const args = createScheduleItemsArgs({ conflictPolicy });
    const result = await dryRunAgentIntent(createScheduleItemsIntent(args), {
      detectScheduleConflicts: async () => [
        {
          endTime: "21:00",
          id: 501,
          startTime: "20:30",
          title: "已有发布会",
        },
      ],
    });

    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") assert.fail("expected proposed action");
    assert.equal((result.action.args as CreateScheduleItemsArgs).items.length, 2);
    assert.equal((result.action.args as CreateScheduleItemsArgs).items[0]?.startTime, "20:00");
    assert.equal((result.action.args as CreateScheduleItemsArgs).items[1]?.startTime, "21:30");
    assert.match(result.action.changes[0]?.afterPreview ?? "", /不会自动重排|自动重排将在后续阶段实现|自动跳过将在后续阶段实现|允许重叠/);
  }
});

test("runDryRunAndProposeStep loads existing schedule-items read-only and still creates pending confirmation", async () => {
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };
    if (args.collection !== "schedule-items") return { docs: [], totalDocs: 0 };

    return {
      docs: [
        {
          date: "2026-06-29",
          endTime: "21:00",
          id: 501,
          isAllDay: false,
          startTime: "20:30",
          status: "planned",
          title: "已有发布会",
        },
      ],
      totalDocs: 1,
    };
  });

  const trace: AgentTraceStep[] = [];
  const persistedPendingActions: PendingAction[] = [];
  const payload = await getPayloadClient();
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: null,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: payload as never,
    persistAgentTurn: async ({ nextPendingAction }) => {
      if (nextPendingAction) persistedPendingActions.push(nextPendingAction);
      return makeThread(nextPendingAction);
    },
    pushTrace: (step) => trace.push(step),
    resolution: {
      engine: "heuristic",
      intent: createScheduleItemsIntent(createScheduleItemsArgs()),
    },
    tokenUsage,
    trace,
    turnAudit: {} as never,
    user: { id: 7 },
  });

  assert.equal(result.outcome, "early_exit");
  if (result.outcome !== "early_exit") assert.fail("expected pending confirmation");
  assert.equal(result.response.pendingAction?.type, "await_confirmation");
  assert.equal(result.response.pendingAction?.action.intent, "create_schedule_items");
  assert.match(result.response.assistantMessage, /发现 \d+ 个时间冲突/);
  assert.match(result.response.assistantMessage, /回复「确认」或「执行」后我再真正写入/);
  assert.equal(persistedPendingActions.length, 1);
  assert.ok(getPayloadStubOperations().some((operation) => operation.type === "find"));
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ),
    false,
  );
});

test("date missing still blocks pending confirmation before conflict detection", async () => {
  const result = await dryRunAgentIntent(createScheduleItemsIntent(createScheduleItemsArgs({
    items: [
      {
        date: "",
        endTime: "22:00",
        startTime: "20:00",
        title: "修复登录页",
      },
    ],
  })), {
    detectScheduleConflicts: async () => {
      throw new Error("conflict detection should not run without concrete dates");
    },
  });

  assert.equal(result.type, "clarify");
  if (result.type !== "clarify") assert.fail("expected clarify result");
  assert.equal(result.pendingAction?.type, "await_clarification");
  assert.match(result.assistantMessage, /未确定日期|补充具体日期|重新调整草案/);
});
