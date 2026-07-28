import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "../../../src/lib/agent/action-receipts";
import { executeAgentIntent } from "../../../src/lib/agent/executor";
import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { createChecklistFromIntent } from "../../../src/lib/agent/tools/checklist-create";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubFindByIDHandler,
  setPayloadStubFindHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const checklist = {
  createdAt: "2026-06-01T00:00:00.000Z",
  groups: [
    {
      items: [
        {
          completedAt: null,
          completionNote: null,
          description: "完成登录页修复并通过冒烟验证。",
          id: "item-login",
          isCompleted: false,
          title: "登录页修复",
        },
      ],
      title: "修复阶段",
    },
  ],
  id: 501,
  slug: "release-checklist",
  status: "draft",
  summary: null,
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

const existingTimelineEvent = {
  createdAt: "2026-06-01T00:00:00.000Z",
  description: "旧说明",
  eventDate: "2026-06-01T00:00:00.000Z",
  id: 801,
  isFeatured: true,
  relatedChecklist: checklist.id,
  relatedTaskKey: "item-login",
  sortOrder: 2,
  status: "published",
  title: "旧 Timeline",
  type: "project",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

const completionIntent: Extract<AgentIntent, { intent: "complete_plan_item" }> = {
  args: {
    checklistTitle: "SunnyPanel 发布清单",
    completedAt: "2026-06-29T20:30:00.000+08:00",
    completionNote: "登录页修复已验收。",
    groupTitle: "修复阶段",
    itemTitle: "登录页修复",
  },
  intent: "complete_plan_item",
};

beforeEach(() => {
  resetPayloadStub();
});

const operationsFor = (type: "create" | "delete" | "update", collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === type &&
      (operation.args as { collection?: string }).collection === collection,
  );

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

const setupPayload = ({
  checklists = [checklist],
  timelineEvents = [],
}: {
  checklists?: unknown[];
  timelineEvents?: unknown[];
} = {}) => {
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };

    if (args.collection === "checklists") {
      return {
        docs: checklists,
        totalDocs: checklists.length,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        docs: timelineEvents,
        totalDocs: timelineEvents.length,
      };
    }

    return {
      docs: [],
      totalDocs: 0,
    };
  });

  setPayloadStubFindByIDHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    if (args.collection === "checklists") {
      return checklists.find(
        (document) =>
          document != null &&
          typeof document === "object" &&
          (document as { id?: unknown }).id === args.id,
      ) ?? null;
    }

    return null;
  });

  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "checklists") {
      return {
        id: 601,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: 802,
        ...(args.data ?? {}),
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 1002,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected create collection ${args.collection ?? "unknown"}`);
  });

  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown>; id?: number };

    if (args.collection === "checklists") {
      return {
        ...checklist,
        groups: args.data?.groups,
        id: args.id ?? checklist.id,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: args.id ?? existingTimelineEvent.id,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });
};

test("create_checklist does not create Timeline events", async () => {
  setupPayload();

  await createChecklistFromIntent(
    {
      groups: [
        {
          items: [
            {
              description: null,
              isCompleted: false,
              title: "登录页修复",
            },
          ],
          title: "修复阶段",
        },
      ],
      title: "SunnyPanel 发布清单",
    },
    undefined,
    {
      payload: await getPayloadClient() as never,
      userId: 1,
    },
  );

  assert.equal(operationsFor("create", "checklists").length, 1);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
});

test("append_plan_item does not create Timeline events", async () => {
  setupPayload();

  await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        description: "补一条回归验证。",
        groupTitle: "修复阶段",
        itemTitle: "回归验证",
      },
      intent: "append_plan_item",
    },
    undefined,
    { userId: 1 },
  );

  assert.equal(operationsFor("update", "checklists").length, 1);
  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.equal(operationsFor("update", "timeline-events").length, 0);
});

test("complete_plan_item creates one Timeline event when none exists", async () => {
  setupPayload();

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  assert.equal(operationsFor("create", "timeline-events").length, 1);
  assert.equal(operationsFor("update", "timeline-events").length, 0);
  assert.equal((result.rollbackPayload as { target?: { timelineEventId?: number } }).target?.timelineEventId, 802);
});

test("complete_plan_item updates existing Timeline event instead of creating duplicates", async () => {
  setupPayload({ timelineEvents: [existingTimelineEvent] });

  const result = await executeAgentIntent(completionIntent, undefined, { userId: 1 });

  assert.equal(operationsFor("create", "timeline-events").length, 0);
  assert.equal(operationsFor("update", "timeline-events").length, 1);
  assert.equal(
    (operationsFor("update", "timeline-events")[0]?.args as { id?: number }).id,
    existingTimelineEvent.id,
  );
  assert.equal(
    (result.rollbackPayload as { beforeSnapshot?: { timelineEvent?: { description?: string } } })
      .beforeSnapshot?.timelineEvent?.description,
    "旧说明",
  );
});

test("receipt replay prevents duplicate Timeline creation on repeated confirmation", async () => {
  setupPayload();
  const store = createMemoryReceiptStore();
  let executeCount = 0;
  const execute = async () => {
    executeCount += 1;

    return executeAgentIntent(completionIntent, undefined, { userId: 1 });
  };

  const first = await runIdempotentAgentAction({
    actionId: "complete-checklist-item-action",
    execute,
    intent: "complete_plan_item",
    store,
    threadId: 9402,
    userId: 1,
  });
  const second = await runIdempotentAgentAction({
    actionId: "complete-checklist-item-action",
    execute,
    intent: "complete_plan_item",
    store,
    threadId: 9402,
    userId: 1,
  });

  assert.equal(executeCount, 1);
  assert.equal(operationsFor("create", "timeline-events").length, 1);
  assert.deepEqual(second, first);
});

test("add_completion_note updates existing Timeline description", async () => {
  setupPayload({
    checklists: [
      {
        ...checklist,
        groups: [
          {
            items: [
              {
                ...checklist.groups[0]!.items[0]!,
                completedAt: "2026-06-29T20:30:00.000+08:00",
                completionNote: "旧备注",
                isCompleted: true,
              },
            ],
            title: "修复阶段",
          },
        ],
      },
    ],
    timelineEvents: [existingTimelineEvent],
  });

  await executeAgentIntent(
    {
      args: {
        checklistTitle: "SunnyPanel 发布清单",
        completionNote: "补充：验证了错误态和成功态。",
        groupTitle: "修复阶段",
        itemTitle: "登录页修复",
      },
      intent: "add_completion_note",
    },
    undefined,
    { userId: 1 },
  );

  const timelineUpdate = operationsFor("update", "timeline-events")[0];
  assert.ok(timelineUpdate);
  assert.match(String((timelineUpdate.args as { data?: { description?: string } }).data?.description), /错误态和成功态/);
});

test("rollback removes a newly created Timeline event and restores checklist groups", async () => {
  setupPayload();
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklist.groups,
        timelineEvent: null,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: checklist.id,
        timelineEventId: 802,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.equal(operationsFor("update", "checklists").length, 1);
  assert.equal(operationsFor("delete", "timeline-events").length, 1);
});

test("rollback restores an existing Timeline snapshot", async () => {
  setupPayload();
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklist.groups,
        timelineEvent: existingTimelineEvent,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: checklist.id,
        timelineEventId: existingTimelineEvent.id,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  const timelineUpdate = operationsFor("update", "timeline-events")[0];
  assert.ok(timelineUpdate);
  assert.equal((timelineUpdate.args as { id?: number }).id, existingTimelineEvent.id);
  assert.equal(
    (timelineUpdate.args as { data?: { description?: string } }).data?.description,
    existingTimelineEvent.description,
  );
});
