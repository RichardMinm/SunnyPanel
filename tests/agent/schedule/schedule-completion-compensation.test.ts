import assert from "node:assert/strict";
import { test } from "node:test";

import { completeScheduleItem, type ScheduleCompletionPayload } from "../../../src/lib/schedule/complete-schedule-item";

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

  const result = await completeScheduleItem({ actor: { isAdministrator: true, userId: 9 }, completedAt: "2026-07-28T09:30:00.000Z", itemId: 701, payload });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rollbackPayload.strategy, "restore_schedule_completion");
  assert.deepEqual(result.rollbackPayload.beforeSnapshot.schedule.status, "planned");
  assert.deepEqual(result.affectedDocuments.map((document) => document.collection), ["schedule-items", "timeline-events"]);
});

test("compensates in reverse order and does not stale-restore divergent state", async () => {
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

  const result = await completeScheduleItem({ actor: { isAdministrator: true, userId: 9 }, completedAt: "2026-07-28T09:30:00.000Z", itemId: 701, payload });

  assert.equal(result.ok, false);
  assert.equal(operations.includes("delete-event"), false, "a failed first write must not compensate uncertain state");
  assert.equal(schedule.status, "done");
});
