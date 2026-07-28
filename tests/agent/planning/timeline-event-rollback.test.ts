import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import { buildChecklistGroupsAndTimelineRollbackPayload } from "../../../src/lib/agent/tools/checklist-rollback";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubDeleteHandler,
  setPayloadStubUpdateHandler,
} from "../../stubs/payload-client";

const checklistGroups = [
  {
    items: [
      {
        completedAt: null,
        completionNote: null,
        id: "item-login",
        isCompleted: false,
        title: "登录页修复",
      },
    ],
    title: "修复阶段",
  },
];

const existingTimelineEvent = {
  createdAt: "2026-06-01T00:00:00.000Z",
  description: "旧说明",
  eventDate: "2026-06-01T00:00:00.000Z",
  id: 9101,
  isFeatured: true,
  relatedChecklist: 9001,
  relatedTaskKey: "item-login",
  sortOrder: 2,
  sourceType: "agent",
  status: "published",
  title: "旧 Timeline",
  type: "project",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

beforeEach(() => {
  resetPayloadStub();
});

const operationsFor = (type: "delete" | "update", collection: string) =>
  getPayloadStubOperations().filter(
    (operation) =>
      operation.type === type &&
      (operation.args as { collection?: string }).collection === collection,
  );

const setupRollbackPayload = () => {
  setPayloadStubUpdateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown>; id?: number };

    if (args.collection === "checklists") {
      return {
        groups: args.data?.groups,
        id: args.id,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        id: args.id,
        ...(args.data ?? {}),
      };
    }

    throw new Error(`unexpected update collection ${args.collection ?? "unknown"}`);
  });
  setPayloadStubDeleteHandler(async (input) => {
    const args = input as { collection?: string; id?: number };

    return {
      id: args.id,
    };
  });
};

test("rollback payload snapshots existing Timeline sourceType", () => {
  const payload = buildChecklistGroupsAndTimelineRollbackPayload(
    9001,
    checklistGroups,
    existingTimelineEvent,
    existingTimelineEvent.id,
  );

  assert.equal(
    (payload.beforeSnapshot.timelineEvent as { sourceType?: string } | null)?.sourceType,
    "agent",
  );
});

test("rollback restores an existing Timeline sourceType and description", async () => {
  setupRollbackPayload();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklistGroups,
        timelineEvent: existingTimelineEvent,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 9001,
        timelineEventId: existingTimelineEvent.id,
      },
    },
    {
      payload: await getPayloadClient() as never,
      persistAudit: false,
      userId: 1,
    },
  );

  const timelineUpdate = operationsFor("update", "timeline-events")[0];
  assert.ok(timelineUpdate);
  assert.equal((timelineUpdate.args as { id?: number }).id, existingTimelineEvent.id);
  assert.equal((timelineUpdate.args as { data?: { description?: string } }).data?.description, "旧说明");
  assert.equal((timelineUpdate.args as { data?: { sourceType?: string } }).data?.sourceType, "agent");
});

test("rollback complete item deletes newly created Timeline and is idempotent-friendly", async () => {
  setupRollbackPayload();

  const payload = await getPayloadClient();
  const rollbackPayload = {
    beforeSnapshot: {
      groups: checklistGroups,
      timelineEvent: null,
    },
    strategy: "restore_checklist_groups_and_timeline",
    target: {
      collection: "checklists",
      documentId: 9001,
      timelineEventId: 9102,
    },
  };

  await executeRollbackFromPayload(rollbackPayload, {
    payload: payload as never,
    persistAudit: false,
    userId: 1,
  });
  await executeRollbackFromPayload(rollbackPayload, {
    payload: payload as never,
    persistAudit: false,
    userId: 1,
  });

  assert.equal(operationsFor("update", "checklists").length, 2);
  assert.equal(operationsFor("delete", "timeline-events").length, 2);
  assert.equal((operationsFor("delete", "timeline-events")[0]?.args as { id?: number }).id, 9102);
});

test("rollback complete item does not affect unrelated Timeline events", async () => {
  setupRollbackPayload();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: checklistGroups,
        timelineEvent: null,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 9001,
        timelineEventId: 9102,
      },
    },
    {
      payload: await getPayloadClient() as never,
      persistAudit: false,
      userId: 1,
    },
  );

  assert.equal(operationsFor("update", "timeline-events").length, 0);
  assert.deepEqual(
    operationsFor("delete", "timeline-events").map((operation) => (operation.args as { id?: number }).id),
    [9102],
  );
});
