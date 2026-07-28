import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";
import type { CreateScheduleItemsRollbackPayload } from "../../../src/lib/agent/tools/schedule-create-items";
import {
  getPayloadStubOperations,
  resetPayloadStub,
} from "../../stubs/payload-client";

/* ── Helpers ── */

type LinkedContentItem = {
  relationTo: string;
  value: unknown;
};

const makePlanStub = (planId: number, linkedContent: LinkedContentItem[]) => {
  const store = new Map<number, { linkedContent: LinkedContentItem[] }>();
  store.set(planId, { linkedContent: [...linkedContent] });

  return {
    findByID: async (args: { id: number }) => {
      const plan = store.get(args.id);
      return plan ? { id: args.id, linkedContent: plan.linkedContent } : null;
    },
    update: async (args: { id: number; data: { linkedContent: LinkedContentItem[] } }) => {
      const plan = store.get(args.id);
      if (!plan) throw new Error("Plan not found");
      plan.linkedContent = args.data.linkedContent;
      return { id: args.id, ...args.data };
    },
    getLinkedContent: (planId: number) => store.get(planId)?.linkedContent ?? null,
  };
};

const buildPayload = (
  documentIds: number[],
  planCleanup?: Array<{ planId: number; scheduleItemIds: number[] }>,
): CreateScheduleItemsRollbackPayload => ({
  strategy: "delete_created_documents",
  target: {
    collection: "schedule-items",
    documentIds,
  },
  ...(planCleanup ? { planCleanup } : {}),
});

const makeDeleteMock = (deletedIds: number[]) => ({
  delete: async (args: { id: number }) => {
    deletedIds.push(args.id);
    return { id: args.id };
  },
});

beforeEach(() => {
  resetPayloadStub();
});

/* ── Tests ── */

test("rollback removes schedule-items link from Plan.linkedContent", async () => {
  const deletedIds: number[] = [];
  const planStub = makePlanStub(99, [
    { relationTo: "schedule-items", value: 801 },
    { relationTo: "checklists", value: 12 },
  ]);

  const payload = buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]);

  await executeRollbackFromPayload(payload, {
    payload: {
      ...planStub,
      ...makeDeleteMock(deletedIds),
    } as never,
    persistAudit: false,
  });

  const linkedContent = planStub.getLinkedContent(99);
  assert.deepEqual(
    linkedContent?.filter((l) => l.relationTo === "schedule-items"),
    [],
    "schedule-items link should be removed",
  );
  assert.ok(
    linkedContent?.some((l) => l.relationTo === "checklists" && l.value === 12),
    "checklists link should be preserved",
  );
  assert.deepEqual(deletedIds, [801], "schedule item should be deleted after cleanup");
});

test("rollback preserves unrelated schedule-items link", async () => {
  const deletedIds: number[] = [];
  const planStub = makePlanStub(99, [
    { relationTo: "schedule-items", value: 801 },
    { relationTo: "schedule-items", value: 999 },
  ]);

  const payload = buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]);

  await executeRollbackFromPayload(payload, {
    payload: { ...planStub, ...makeDeleteMock(deletedIds) } as never,
    persistAudit: false,
  });

  const linkedContent = planStub.getLinkedContent(99);
  assert.ok(
    linkedContent?.some((l) => l.relationTo === "schedule-items" && l.value === 999),
    "unrelated schedule-item 999 should be preserved",
  );
  assert.ok(
    !linkedContent?.some((l) => l.relationTo === "schedule-items" && l.value === 801),
    "deleted schedule-item 801 should be removed",
  );
});

test("rollback removes populated schedule relations and preserves unrelated links", async () => {
  const deletedIds: number[] = [];
  const planStub = makePlanStub(99, [
    { relationTo: "schedule-items", value: { id: 801, title: "待删除日程" } },
    { relationTo: "schedule-items", value: { id: 999, title: "保留日程" } },
    { relationTo: "checklists", value: { id: 12, title: "关联清单" } },
  ]);

  await executeRollbackFromPayload(
    buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]),
    {
      payload: { ...planStub, ...makeDeleteMock(deletedIds) } as never,
      persistAudit: false,
    },
  );

  assert.deepEqual(planStub.getLinkedContent(99), [
    { relationTo: "schedule-items", value: 999 },
    { relationTo: "checklists", value: 12 },
  ]);
  assert.deepEqual(deletedIds, [801]);
});

test("batch cleanup removes all created schedule-item links", async () => {
  const deletedIds: number[] = [];
  const planStub = makePlanStub(99, [
    { relationTo: "schedule-items", value: 801 },
    { relationTo: "schedule-items", value: 802 },
    { relationTo: "posts", value: 10 },
  ]);

  const payload = buildPayload([801, 802], [{ planId: 99, scheduleItemIds: [801, 802] }]);

  await executeRollbackFromPayload(payload, {
    payload: { ...planStub, ...makeDeleteMock(deletedIds) } as never,
    persistAudit: false,
  });

  const linkedContent = planStub.getLinkedContent(99);
  assert.ok(
    !linkedContent?.some((l) => l.relationTo === "schedule-items"),
    "all schedule-items should be removed",
  );
  assert.ok(
    linkedContent?.some((l) => l.relationTo === "posts" && l.value === 10),
    "posts link should be preserved",
  );
});

test("multiple plans cleanup removes links from each plan", async () => {
  const deletedIds: number[] = [];
  const plan99 = makePlanStub(99, [
    { relationTo: "schedule-items", value: 801 },
    { relationTo: "checklists", value: 12 },
  ]);
  const plan100 = makePlanStub(100, [
    { relationTo: "schedule-items", value: 901 },
  ]);

  const comboStub = {
    findByID: async (args: { id: number }) => {
      if (args.id === 99) return plan99.findByID(args);
      if (args.id === 100) return plan100.findByID(args);
      return null;
    },
    update: async (args: { id: number; data: { linkedContent: LinkedContentItem[] } }) => {
      if (args.id === 99) return plan99.update(args);
      if (args.id === 100) return plan100.update(args);
      throw new Error("Unknown plan");
    },
    ...makeDeleteMock(deletedIds),
  };

  const payload = buildPayload(
    [801, 901],
    [
      { planId: 99, scheduleItemIds: [801] },
      { planId: 100, scheduleItemIds: [901] },
    ],
  );

  await executeRollbackFromPayload(payload, {
    payload: comboStub as never,
    persistAudit: false,
  });

  assert.ok(
    !plan99.getLinkedContent(99)?.some((l) => l.relationTo === "schedule-items"),
    "plan 99 schedule-item should be removed",
  );
  assert.ok(
    !plan100.getLinkedContent(100)?.some((l) => l.relationTo === "schedule-items"),
    "plan 100 schedule-item should be removed",
  );
});

test("rollback idempotency — repeated rollback does not fail", async () => {
  const deletedIds: number[] = [];
  const planStub = makePlanStub(99, [
    { relationTo: "schedule-items", value: 801 },
  ]);

  const payload = buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]);

  const stubPayload = {
    ...planStub,
    delete: async (args: { id: number }) => {
      deletedIds.push(args.id);
      /* schedule-items are already deleted on second rollback, but
       * the test stubs don't simulate 404. The important thing is
       * that Plan.linkedContent cleanup is idempotent. */
      return { id: args.id };
    },
  };

  /* First rollback */
  await executeRollbackFromPayload(payload, {
    payload: stubPayload as never,
    persistAudit: false,
  });

  const afterFirst = planStub.getLinkedContent(99);
  assert.ok(
    !afterFirst?.some((l) => l.relationTo === "schedule-items"),
    "link removed after first rollback",
  );

  /* Second rollback — cleanup is idempotent (filter passes through) */
  await executeRollbackFromPayload(payload, {
    payload: stubPayload as never,
    persistAudit: false,
  });

  const afterSecond = planStub.getLinkedContent(99);
  assert.equal(
    afterSecond?.length,
    afterFirst?.length,
    "linkedContent unchanged after second rollback",
  );
});

test("cleanup failure throws — does not silently continue", async () => {
  const deletedIds: number[] = [];

  const failingStub = {
    findByID: async () => ({
      id: 99,
      linkedContent: [{ relationTo: "schedule-items", value: 801 }],
    }),
    /* plan update fails */
    update: async () => {
      throw new Error("Plan update failed");
    },
    ...makeDeleteMock(deletedIds),
  };

  const payload = buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]);

  await assert.rejects(
    executeRollbackFromPayload(payload, {
      payload: failingStub as never,
      persistAudit: false,
    }),
    /Plan update failed/,
    "cleanup failure should throw, not silently continue",
  );

  /* schedule-items should NOT be deleted when cleanup failed */
  assert.equal(
    deletedIds.length,
    0,
    "schedule items should not be deleted when Plan.linkedContent cleanup failed",
  );
});

test("old payload without planCleanup still works", async () => {
  const deletedIds: number[] = [];

  const payload = buildPayload([801]); /* no planCleanup */

  await executeRollbackFromPayload(payload, {
    payload: makeDeleteMock(deletedIds) as never,
    persistAudit: false,
  });

  assert.deepEqual(deletedIds, [801], "old payload deletes schedule items");
});

test("cleanup skips plan not found without error", async () => {
  const deletedIds: number[] = [];

  const stub = {
    findByID: async () => null, /* plan not found */
    ...makeDeleteMock(deletedIds),
  };

  const payload = buildPayload([801], [{ planId: 99, scheduleItemIds: [801] }]);

  await executeRollbackFromPayload(payload, {
    payload: stub as never,
    persistAudit: false,
  });

  /* Plan not found is not an error — skip cleanup, delete items */
  assert.deepEqual(deletedIds, [801], "items should still be deleted");
});
