import assert from "node:assert/strict";
import { test } from "node:test";

import { completeScheduleItem, createTransactionalScheduleCompletionPayload, runScheduleCompletionTransaction, type ScheduleCompletionPayload } from "../../../src/lib/schedule/complete-schedule-item";

const withTransaction = (payload: ScheduleCompletionPayload): ScheduleCompletionPayload => ({
  ...payload,
  runInTransaction: async (_actor, operation) => operation({ ...payload, isTransactional: true }),
});

test("returns a full rollback payload with sanitized affected documents", async () => {
  const schedule = { createdAt: "x", date: "2026-07-28", id: 701, isAllDay: false, priority: "medium", sourceType: "manual", status: "planned", title: "发布", updatedAt: "x" };
  let event: Record<string, unknown> | null = null;
  const payload: ScheduleCompletionPayload = {
    create: async ({ data }) => (event = { id: 801, ...data }),
    delete: async () => null,
    find: async () => ({ docs: event ? [event] : [], totalDocs: event ? 1 : 0 }),
    findByID: async ({ collection, id }) => collection === "schedule-items" && id === 701 ? schedule : null,
    update: async ({ collection, data, id }) => {
      if (collection === "schedule-items") Object.assign(schedule, data);
      if (collection === "timeline-events" && event?.id === id && event) Object.assign(event, data);
      return collection === "schedule-items" ? schedule : event;
    },
  };

  const result = await completeScheduleItem({ actor: { isAdministrator: true, userId: 9 }, completedAt: "2026-07-28T09:30:00.000Z", itemId: 701, payload: withTransaction(payload) });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rollbackPayload.strategy, "restore_schedule_completion");
  assert.deepEqual(result.rollbackPayload.beforeSnapshot.schedule.status, "planned");
  assert.deepEqual(result.affectedDocuments.map((document) => document.collection), ["schedule-items", "timeline-events"]);
});

test("returns an uncertain Schedule write failure to the transaction runner without stale compensation", async () => {
  const schedule = { createdAt: "x", date: "2026-07-28", id: 701, isAllDay: false, priority: "medium", sourceType: "manual", status: "planned", title: "发布", updatedAt: "x" };
  const operations: string[] = [];
  let event: Record<string, unknown> | null = null;
  const payload: ScheduleCompletionPayload = {
    create: async ({ data }) => (event = { id: 801, ...data }),
    delete: async () => { operations.push("delete-event"); event = null; return null; },
    find: async () => ({ docs: event ? [event] : [], totalDocs: event ? 1 : 0 }),
    findByID: async ({ collection, id }) => collection === "schedule-items" && id === 701 ? schedule : null,
    update: async ({ collection, data }) => {
      operations.push(`update-${collection}`);
      if (collection === "schedule-items" && data.status === "done") {
        Object.assign(schedule, data);
        throw new Error("uncertain schedule write");
      }
      if (collection === "schedule-items") Object.assign(schedule, data);
      return schedule;
    },
  };

  const result = await completeScheduleItem({
    actor: { isAdministrator: true, userId: 9 },
    completedAt: "2026-07-28T09:30:00.000Z",
    itemId: 701,
    payload: {
      ...payload,
      runInTransaction: async (_actor, operation) => {
        const before = structuredClone(schedule);
        const result = await operation({ ...payload, isTransactional: true });
        if (!result.ok) Object.assign(schedule, before);
        return result;
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(operations.includes("delete-event"), false, "a failed first write must not compensate uncertain state");
  assert.equal(operations.filter((operation) => operation === "update-schedule-items").length, 1);
  assert.equal(schedule.status, "planned");
});

test("requires a transaction before it performs Schedule business operations", async () => {
  const schedule = { createdAt: "x", date: "2026-07-28", id: 701, isAllDay: false, priority: "medium", sourceType: "manual", status: "planned", title: "发布", updatedAt: "x" };
  const operations: string[] = [];
  const payload: ScheduleCompletionPayload = {
    create: async () => { operations.push("create"); return null; },
    delete: async () => { operations.push("delete"); return null; },
    find: async () => { operations.push("find"); return { docs: [], totalDocs: 0 }; },
    findByID: async () => { operations.push("findByID"); return schedule; },
    update: async () => { operations.push("update"); return schedule; },
  };

  const result = await completeScheduleItem({
    actor: { isAdministrator: true, userId: 9 },
    completedAt: "2026-07-28T09:30:00.000Z",
    itemId: 701,
    payload,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "transaction_unavailable");
  assert.deepEqual(operations, []);
});

test("production transaction factory keeps outer CRUD inert until the runner starts", async () => {
  let payloadOperations = 0;
  const boundary = createTransactionalScheduleCompletionPayload({
    payload: {
      create: async () => { payloadOperations += 1; return null; },
    } as never,
  });

  await assert.rejects(
    boundary.create({ collection: "timeline-events", data: {}, overrideAccess: true }),
    /requires its transaction runner/u,
  );
  assert.equal(payloadOperations, 0);
});

test("a rollback exception converts a typed business failure into sanitized compensation_failed", async () => {
  const req = { transactionID: Promise.resolve("schedule-completion-tx") };
  const result = await runScheduleCompletionTransaction({
    commit: async () => { throw new Error("commit must not run"); },
    operation: async () => ({ code: "timeline_write_failed", ok: false as const, safeMessage: "safe business failure" }),
    payload: {
      db: {
        rollbackTransaction: async () => { throw new Error("raw rollback failure"); },
      },
    } as never,
    req: req as never,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "compensation_failed");
  assert.equal(result.safeMessage.includes("raw rollback failure"), false);
  assert.equal("transactionID" in req, false);
});
