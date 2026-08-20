import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../../src/lib/agent/action-receipts";
import type { CreateScheduleItemsArgs } from "../../../src/lib/agent/schemas";
import { createScheduleItemsFromIntent } from "../../../src/lib/agent/tools/schedule-create-items";
import {
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
} from "../../stubs/payload-client";

const sampleArgs: CreateScheduleItemsArgs = {
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
  sourceText: "从日程草案准备创建正式日程。",
  sourceType: "manual",
  title: "日程草案：2 项任务",
};

beforeEach(() => {
  resetPayloadStub();
});

test("action receipt replay prevents duplicate schedule item creation", async () => {
  let savedResponse: unknown = null;
  let nextScheduleId = 1001;
  let scheduleCreateCount = 0;
  const store: AgentActionReceiptStore = {
    claim: async () =>
      savedResponse
        ? {
            response: savedResponse,
            status: "replay",
          }
        : {
            receiptId: 1,
            status: "claimed",
          },
    complete: async (_receiptId, response) => {
      savedResponse = response;
    },
    markIndeterminate: async () => undefined,
  };

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      scheduleCreateCount += 1;
      return {
        id: nextScheduleId++,
        ...args.data,
      };
    }

    return { id: 1901, ...args.data };
  });

  const execute = () => createScheduleItemsFromIntent(sampleArgs);
  const first = await runIdempotentAgentAction({
    actionId: "create-schedule-items-action",
    execute,
    intent: "create_schedule_items",
    store,
    threadId: 42,
    userId: 7,
  });
  const replayed = await runIdempotentAgentAction({
    actionId: "create-schedule-items-action",
    execute,
    intent: "create_schedule_items",
    store,
    threadId: 42,
    userId: 7,
  });

  assert.deepEqual(replayed, first);
  assert.deepEqual(first.createdScheduleItemIds, [1001, 1002]);
  assert.equal(scheduleCreateCount, 2);
  assert.equal(
    getPayloadStubOperations().filter(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "schedule-items",
    ).length,
    2,
  );
  assert.deepEqual(savedResponse, first);
  assert.deepEqual(
    (savedResponse as { rollbackPayload?: unknown }).rollbackPayload,
    first.rollbackPayload,
  );
});

test("partial failure deletes already created schedule items", async () => {
  let scheduleCreateCount = 0;
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      scheduleCreateCount += 1;
      if (scheduleCreateCount === 2) {
        throw new Error("second item failed");
      }

      return {
        id: 1101,
        ...args.data,
      };
    }

    return { id: 1911, ...args.data };
  });

  const result = await createScheduleItemsFromIntent(sampleArgs);

  assert.equal(result.status, "failed");
  assert.equal(result.compensationStatus, "completed");
  assert.deepEqual(result.createdScheduleItemIds, [1101]);
  assert.match(result.assistantMessage, /已回滚|已删除|补偿/);
  assert.doesNotMatch(result.assistantMessage, /second item failed/);
  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .map((operation) => operation.args),
    [
      { collection: "schedule-items", id: 1101, overrideAccess: true },
    ],
  );
});

test("partial failure reports indeterminate state when compensation deletion fails", async () => {
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection: string; data: Record<string, unknown> };

    if (args.collection === "schedule-items") {
      if ((args.data as { title?: string }).title === "整理发布文档") {
        throw new Error("second item failed");
      }

      return {
        id: 1201,
        ...args.data,
      };
    }

    return { id: 1921, ...args.data };
  });
  setPayloadStubDeleteHandler(async () => {
    throw new Error("delete failed");
  });

  const result = await createScheduleItemsFromIntent(sampleArgs);

  assert.equal(result.status, "failed");
  assert.equal(result.compensationStatus, "failed");
  assert.deepEqual(result.createdScheduleItemIds, [1201]);
  assert.match(result.assistantMessage, /部分|未能完成补偿|需要人工检查/);
  assert.doesNotMatch(result.assistantMessage, /second item failed|delete failed/);
  assert.deepEqual(result.rollbackPayload, {
    strategy: "delete_created_documents",
    target: {
      collection: "schedule-items",
      documentIds: [1201],
    },
  });
});
