import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeAgentIntent } from "../../../src/lib/agent/executor";
import type { CreateScheduleItemsArgs } from "../../../src/lib/agent/schemas";
import {
  buildScheduleItemCreateData,
  createScheduleItemsFromIntent,
} from "../../../src/lib/agent/tools/schedule-create-items";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
} from "../../stubs/payload-client";

const sampleArgs: CreateScheduleItemsArgs = {
  items: [
    {
      conflictNote: "需要避开已有发布会。",
      date: "2026-06-29",
      description: "完成登录表单修复。",
      endTime: "22:00",
      isAllDay: false,
      priority: null,
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-login",
      relatedPlanId: 99,
      sourceTaskTitle: "修复登录页",
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-30",
      endTime: "11:00",
      isAllDay: false,
      relatedChecklistId: 12,
      relatedChecklistItemKey: "item-docs",
      relatedPlanId: 99,
      sourceTaskTitle: "整理发布文档",
      startTime: "09:00",
      title: "整理发布文档",
    },
  ],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceText: "从日程草案准备创建正式日程。",
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
};

beforeEach(() => {
  resetPayloadStub();
});

test("buildScheduleItemCreateData maps CreateScheduleItemsArgs to Payload data", () => {
  const result = buildScheduleItemCreateData(sampleArgs, sampleArgs.items[0]!);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected valid schedule item data");
  const data = result.data;
  assert.equal(data.title, "修复登录页");
  assert.equal(data.description, "完成登录表单修复。");
  assert.equal(data.date, "2026-06-29");
  assert.equal(data.startTime, "20:00");
  assert.equal(data.endTime, "22:00");
  assert.equal(data.isAllDay, false);
  assert.equal(data.status, "planned");
  assert.equal(data.priority, "medium");
  assert.equal(data.sourceType, "checklist");
  assert.equal(data.category, "default");
  assert.equal(data.relatedPlan, 99);
  assert.equal(data.relatedChecklist, 12);
  assert.equal(data.relatedChecklistItemKey, "item-login");
  assert.equal(data.createdBy, "agent");
  assert.equal(data.conflictNote, "需要避开已有发布会。");
  assert.equal("sourceText" in data, false);
  assert.deepEqual(sampleArgs.items[0]?.priority, null);
});

test("buildScheduleItemCreateData validates required fields and HH:mm times", () => {
  assert.equal(
    buildScheduleItemCreateData(sampleArgs, { ...sampleArgs.items[0]!, title: " " }).ok,
    false,
  );
  assert.equal(
    buildScheduleItemCreateData(sampleArgs, { ...sampleArgs.items[0]!, date: " " }).ok,
    false,
  );
  assert.equal(
    buildScheduleItemCreateData(sampleArgs, { ...sampleArgs.items[0]!, startTime: "8pm" }).ok,
    false,
  );
});

test("createScheduleItemsFromIntent rejects empty or oversized item lists without writes", async () => {
  const empty = await createScheduleItemsFromIntent({ ...sampleArgs, items: [] });
  const oversized = await createScheduleItemsFromIntent({
    ...sampleArgs,
    items: Array.from({ length: 25 }, (_, index) => ({
      date: "2026-06-29",
      title: `任务 ${index + 1}`,
    })),
  });

  assert.equal(empty.status, "failed");
  assert.equal(oversized.status, "failed");
  assert.deepEqual(getPayloadStubOperations(), []);
});

test("createScheduleItemsFromIntent writes schedule items and AgentRun", async () => {
  let nextScheduleId = 801;
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      return {
        id: nextScheduleId++,
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 9801,
        ...args.data,
      };
    }

    throw new Error(`unexpected collection ${args.collection}`);
  });

  const result = await createScheduleItemsFromIntent(sampleArgs);

  assert.equal(result.status, "completed");
  assert.equal(result.type, "create_schedule_items");
  assert.deepEqual(result.createdScheduleItemIds, [801, 802]);
  assert.equal(result.itemsCount, 2);
  assert.equal(result.dateRange, "2026-06-29 → 2026-06-30");
  assert.deepEqual(result.rollbackPayload, {
    strategy: "delete_created_documents",
    target: {
      collection: "schedule-items",
      documentIds: [801, 802],
    },
    planCleanup: [{ planId: 99, scheduleItemIds: [801, 802] }],
  });

  const operations = getPayloadStubOperations();
  const scheduleCreates = operations.filter(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === "schedule-items",
  );
  const agentRunCreate = operations.find(
    (operation) =>
      operation.type === "create" &&
      (operation.args as { collection?: string }).collection === "agent-runs",
  );

  assert.equal(scheduleCreates.length, 2);
  assert.ok(agentRunCreate);
  assert.equal(
    ((scheduleCreates[0]?.args as { data: { sourceText?: string } }).data.sourceText),
    undefined,
  );
  assert.equal(
    ((scheduleCreates[0]?.args as { data: { relatedPlan?: number } }).data.relatedPlan),
    99,
  );
  assert.equal(
    ((scheduleCreates[0]?.args as { data: { relatedChecklist?: number } }).data.relatedChecklist),
    12,
  );
});

test("createScheduleItemsFromIntent compensates schedule items when AgentRun audit fails", async () => {
  let nextScheduleId = 821;
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      return {
        id: nextScheduleId++,
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      throw new Error("agent run unavailable");
    }

    throw new Error(`unexpected collection ${args.collection}`);
  });
  setPayloadStubDeleteHandler(async (input) => {
    const args = input as { collection: string; id: number };

    return { id: args.id };
  });

  const result = await createScheduleItemsFromIntent(sampleArgs);
  const deleteOperations = getPayloadStubOperations().filter(
    (operation) =>
      operation.type === "delete" &&
      (operation.args as { collection?: string }).collection === "schedule-items",
  );

  assert.equal(result.status, "failed");
  assert.equal(result.compensationStatus, "completed");
  assert.deepEqual(result.createdScheduleItemIds, [821, 822]);
  assert.match(result.assistantMessage, /记录批量日程审计失败/);
  assert.deepEqual(
    deleteOperations.map((operation) => (operation.args as { id: number }).id),
    [822, 821],
  );
});

test("executor create_schedule_items branch creates items after confirmation", async () => {
  let nextScheduleId = 901;
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      return {
        id: nextScheduleId++,
        ...args.data,
      };
    }

    return {
      id: 9901,
      ...args.data,
    };
  });

  const result = await executeAgentIntent(
    {
      args: sampleArgs,
      intent: "create_schedule_items",
    },
    undefined,
    { userId: 7 },
  );

  assert.match(result.assistantMessage, /已创建 2 个日程项/);
  assert.equal(result.pendingAction, null);
  assert.deepEqual(
    (result.rollbackPayload as { target?: { documentIds?: number[] } }).target?.documentIds,
    [901, 902],
  );
});

test("createScheduleItemsFromIntent does not call compose_schedule_item or schedule_plan", async () => {
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };
    return { id: args.collection === "schedule-items" ? 701 : 9701, ...args.data };
  });

  await createScheduleItemsFromIntent(sampleArgs);

  assert.equal(
    getPayloadStubOperations().some((operation) =>
      JSON.stringify(operation.args).includes("compose_schedule_item") ||
      JSON.stringify(operation.args).includes("schedule_plan"),
    ),
    false,
  );
});
