import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload, isRollbackPayloadExecutable } from "../../src/lib/agent/rollback";
import { dryRunAgentTool } from "../../src/lib/agent/tool-registry";
import { deleteRecordFromIntent } from "../../src/lib/agent/tools/delete-record";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
  setPayloadStubDeleteHandler,
  setPayloadStubFindByIDHandler,
} from "../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

const resolvedDeleteTarget = (
  collection: "checklists" | "plans" | "schedule-items" | "timeline-events",
  document: Record<string, unknown>,
) => ({
  question: null,
  resolved: {
    collection,
    document: document as Record<string, unknown> & { id: number; title: string },
    id: document.id as number,
    title: document.title as string,
  },
});

test("delete_record dry-run supports schedule, checklist, and timeline targets", async () => {
  const cases = [
    {
      args: { entityName: "晨间复盘", entityType: "schedule" as const },
      collection: "schedule-items" as const,
      document: {
        date: "2026-07-01",
        id: 41,
        status: "planned",
        title: "晨间复盘",
      },
      strategy: "restore_deleted_schedule_item",
    },
    {
      args: { entityName: "高数冲刺", entityType: "checklist" as const },
      collection: "checklists" as const,
      document: {
        groups: [{ items: [], title: "默认" }],
        id: 42,
        status: "draft",
        title: "高数冲刺",
        visibility: "private",
      },
      strategy: "restore_deleted_checklist",
    },
    {
      args: { entityName: "第一版上线", entityType: "timeline" as const },
      collection: "timeline-events" as const,
      document: {
        eventDate: "2026-07-02T00:00:00.000Z",
        id: 43,
        status: "published",
        title: "第一版上线",
        type: "milestone",
        visibility: "public",
      },
      strategy: "restore_deleted_timeline_event",
    },
  ];

  for (const item of cases) {
    const result = await dryRunAgentTool(
      {
        args: item.args,
        intent: "delete_record",
      },
      {
        createActionId: () => `delete-${item.document.id}`,
        resolveDeleteRecord: async () => resolvedDeleteTarget(item.collection, item.document),
      },
    );

    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") continue;
    assert.equal(result.action.id, `delete-${item.document.id}`);
    assert.equal(result.action.requiresConfirmation, true);
    assert.equal(result.action.riskLevel, "high");
    assert.equal(result.action.changes[0]?.collection, item.collection);
    assert.equal(result.action.changes[0]?.documentId, item.document.id);
    assert.equal(result.action.changes[0]?.operation, "delete");
    assert.equal((result.action.args as { targetId?: number }).targetId, item.document.id);
    assert.equal((result.action.rollbackPayload as { strategy?: string }).strategy, item.strategy);
    assert.equal(isRollbackPayloadExecutable(result.action.rollbackPayload), true);
  }
});

test("delete_record dry-run clarifies missing or ambiguous non-plan targets", async () => {
  const result = await dryRunAgentTool(
    {
      args: { entityName: "晨间", entityType: "schedule" },
      intent: "delete_record",
    },
    {
      resolveDeleteRecord: async () => ({
        question: "找到多个匹配的日程：晨间复盘、晨间阅读。请指定名称或 ID。",
        resolved: null,
      }),
    },
  );

  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.match(result.assistantMessage, /多个匹配/);
    assert.equal(result.pendingAction?.type, "await_clarification");
  }
});

test("delete_record executes a schedule delete, audits it, and returns an executable rollback payload", async () => {
  setPayloadStubFindByIDHandler(async () => ({
    date: "2026-07-01",
    endTime: "09:30",
    id: 41,
    priority: "medium",
    startTime: "09:00",
    status: "planned",
    title: "晨间复盘",
  }));
  setPayloadStubDeleteHandler(async () => ({ id: 41 }));
  setPayloadStubCreateHandler(async () => ({ id: 900 }));

  const payload = await getPayloadClient();
  const result = await deleteRecordFromIntent(
    {
      entityName: "晨间复盘",
      entityType: "schedule",
      targetId: 41,
    },
    undefined,
    { payload: payload as never },
  );

  assert.deepEqual(
    getPayloadStubOperations().find((operation) => operation.type === "delete")?.args,
    {
      collection: "schedule-items",
      id: 41,
      overrideAccess: true,
    },
  );
  assert.equal(
    getPayloadStubOperations().some(
      (operation) =>
        operation.type === "create" &&
        (operation.args as { collection?: string }).collection === "agent-runs",
    ),
    true,
  );
  assert.match(result.assistantMessage, /已删除日程/);
  assert.deepEqual(result.rollbackPayload, {
    beforeSnapshot: {
      date: "2026-07-01",
      endTime: "09:30",
      priority: "medium",
      startTime: "09:00",
      status: "planned",
      title: "晨间复盘",
    },
    strategy: "restore_deleted_schedule_item",
    target: {
      collection: "schedule-items",
      documentId: 41,
    },
  });
  assert.equal(result.rollbackSourceRunId, 900);
  assert.equal(isRollbackPayloadExecutable(result.rollbackPayload), true);
});

test("rollback restores deleted schedule, checklist, and timeline records from snapshots", async () => {
  const payload = await getPayloadClient();
  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        date: "2026-07-01",
        status: "planned",
        title: "晨间复盘",
      },
      strategy: "restore_deleted_schedule_item",
      target: { collection: "schedule-items", documentId: 41 },
    },
    { payload: payload as never, persistAudit: false },
  );
  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        groups: [{ items: [], title: "默认" }],
        status: "draft",
        title: "高数冲刺",
        visibility: "private",
      },
      strategy: "restore_deleted_checklist",
      target: { collection: "checklists", documentId: 42 },
    },
    { payload: payload as never, persistAudit: false },
  );
  await executeRollbackFromPayload(
    {
      beforeSnapshot: {
        eventDate: "2026-07-02T00:00:00.000Z",
        status: "published",
        title: "第一版上线",
        type: "milestone",
        visibility: "public",
      },
      strategy: "restore_deleted_timeline_event",
      target: { collection: "timeline-events", documentId: 43 },
    },
    { payload: payload as never, persistAudit: false },
  );

  assert.deepEqual(
    getPayloadStubOperations()
      .filter((operation) => operation.type === "create")
      .map((operation) => operation.args),
    [
      {
        collection: "schedule-items",
        data: {
          date: "2026-07-01",
          status: "planned",
          title: "晨间复盘",
        },
        overrideAccess: true,
      },
      {
        collection: "checklists",
        data: {
          groups: [{ items: [], title: "默认" }],
          status: "draft",
          title: "高数冲刺",
          visibility: "private",
        },
        overrideAccess: true,
      },
      {
        collection: "timeline-events",
        data: {
          eventDate: "2026-07-02T00:00:00.000Z",
          status: "published",
          title: "第一版上线",
          type: "milestone",
          visibility: "public",
        },
        overrideAccess: true,
      },
    ],
  );
});
