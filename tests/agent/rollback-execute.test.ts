import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../src/lib/agent/rollback";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
} from "../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

test("executeRollbackFromPayload deletes multiple created schedule items", async () => {
  const payload = await getPayloadClient();
  const result = await executeRollbackFromPayload(
    {
      strategy: "delete_created_documents",
      target: {
        collection: "schedule-items",
        documentIds: [11, 12],
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.equal(result.collection, "schedule-items");
  assert.equal(result.documentId, 11);
  assert.deepEqual(result.documentIds, [11, 12]);
  assert.equal(result.strategy, "delete_created_documents");
  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "delete")
      .map((operation) => operation.args),
    [
      { collection: "schedule-items", id: 11, overrideAccess: true },
      { collection: "schedule-items", id: 12, overrideAccess: true },
    ],
  );
});

test("executeRollbackFromPayload records multi-document rollback audit with affected documents", async () => {
  const payload = await getPayloadClient();
  const auditResults: Array<{
    affectedDocuments?: unknown;
    summary?: string;
  }> = [];

  await executeRollbackFromPayload(
    {
      strategy: "delete_created_documents",
      target: {
        collection: "schedule-items",
        documentIds: [11, 12],
      },
    },
    {
      payload: payload as never,
      recordAudit: async ({ result }) => {
        auditResults.push(result);
      },
    },
  );

  assert.deepEqual(auditResults[0]?.affectedDocuments, [
    {
      collection: "schedule-items",
      documentId: 11,
      operation: "delete",
      visibility: "unknown",
    },
    {
      collection: "schedule-items",
      documentId: 12,
      operation: "delete",
      visibility: "unknown",
    },
  ]);
  assert.equal(auditResults[0]?.summary, "已执行回滚 delete_created_documents，影响 2 个对象：schedule-items#11 delete；schedule-items#12 delete");
});

test("executeRollbackFromPayload restores a schedule item snapshot", async () => {
  const payload = await getPayloadClient();
  const result = await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        date: "2026-06-01",
        endTime: "10:30",
        startTime: "09:00",
        status: "planned",
        title: "原日程",
      },
      strategy: "restore_schedule_item_snapshot",
      target: {
        collection: "schedule-items",
        documentId: 42,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.equal(result.collection, "schedule-items");
  assert.equal(result.documentId, 42);
  assert.equal(result.strategy, "restore_schedule_item_snapshot");
  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "update")?.args,
    {
      collection: "schedule-items",
      data: {
        date: "2026-06-01",
        endTime: "10:30",
        startTime: "09:00",
        status: "planned",
        title: "原日程",
      },
      id: 42,
      overrideAccess: true,
    },
  );
});

test("executeRollbackFromPayload restores only schedule item status", async () => {
  const payload = await getPayloadClient();
  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        status: "planned",
      },
      strategy: "restore_schedule_item_status",
      target: {
        collection: "schedule-items",
        documentId: 42,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "update")?.args,
    {
      collection: "schedule-items",
      data: {
        status: "planned",
      },
      id: 42,
      overrideAccess: true,
    },
  );
});

test("executeRollbackFromPayload restores checklist groups and deletes a newly created timeline event", async () => {
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: [{ title: "原分组" }],
        timelineEvent: null,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 101,
        timelineEventId: 501,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "update" || operation.type === "delete")
      .map((operation) => operation.args),
    [
      {
        collection: "checklists",
        data: {
          groups: [{ title: "原分组" }],
        },
        id: 101,
        overrideAccess: true,
      },
      {
        collection: "timeline-events",
        id: 501,
        overrideAccess: true,
      },
    ],
  );
});

test("executeRollbackFromPayload records compound rollback audit with mixed operations", async () => {
  const payload = await getPayloadClient();
  const auditResults: Array<{
    affectedDocuments?: unknown;
    summary?: string;
  }> = [];

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: [{ title: "原分组" }],
        timelineEvent: null,
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 101,
        timelineEventId: 501,
      },
    },
    {
      payload: payload as never,
      recordAudit: async ({ result }) => {
        auditResults.push(result);
      },
    },
  );

  assert.deepEqual(auditResults[0]?.affectedDocuments, [
    {
      collection: "checklists",
      documentId: 101,
      operation: "update",
      visibility: "unknown",
    },
    {
      collection: "timeline-events",
      documentId: 501,
      operation: "delete",
      visibility: "unknown",
    },
  ]);
  assert.equal(auditResults[0]?.summary, "已执行回滚 restore_checklist_groups_and_timeline，影响 2 个对象：checklists#101 update；timeline-events#501 delete");
});

test("executeRollbackFromPayload restores checklist groups and an existing timeline event snapshot", async () => {
  const payload = await getPayloadClient();

  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: [{ title: "原分组" }],
        timelineEvent: {
          description: "旧说明",
          eventDate: "2026-06-01T00:00:00.000Z",
          id: 501,
          isFeatured: true,
          relatedChecklist: 101,
          relatedTaskKey: "item-1",
          sortOrder: 3,
          status: "published",
          title: "旧时间线",
          type: "project",
          visibility: "private",
        },
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 101,
        timelineEventId: 501,
      },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "update")
      .map((operation) => operation.args),
    [
      {
        collection: "checklists",
        data: {
          groups: [{ title: "原分组" }],
        },
        id: 101,
        overrideAccess: true,
      },
      {
        collection: "timeline-events",
        data: {
          description: "旧说明",
          eventDate: "2026-06-01T00:00:00.000Z",
          isFeatured: true,
          relatedChecklist: 101,
          relatedTaskKey: "item-1",
          sortOrder: 3,
          status: "published",
          title: "旧时间线",
          type: "project",
          visibility: "private",
        },
        id: 501,
        overrideAccess: true,
      },
    ],
  );
});
