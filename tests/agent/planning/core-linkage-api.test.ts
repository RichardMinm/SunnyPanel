import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadChecklistSummaries,
  loadPlanSummaries,
  loadScheduleSummaries,
  loadTimelineSummaries,
} from "../../../src/lib/core-linkage/api-summaries";

type FindArgs = {
  collection: string;
  where?: unknown;
};

const createPayload = (docsByCollection: Record<string, Array<Record<string, unknown>>>) => {
  const calls: FindArgs[] = [];
  return {
    calls,
    payload: {
      find: async (args: FindArgs) => {
        calls.push(args);
        return {
          docs: docsByCollection[args.collection] ?? [],
          totalDocs: docsByCollection[args.collection]?.length ?? 0,
        };
      },
    },
  };
};

const assertLinkedSummaryKeys = (linkedObjects: Array<Record<string, unknown>>) => {
  for (const linkedObject of linkedObjects) {
    const expectedKeys = linkedObject.type === "schedule" || linkedObject.type === "timeline"
      ? ["date", "id", "status", "title", "type"]
      : ["id", "title", "type"];
    assert.deepEqual(Object.keys(linkedObject).sort(), expectedKeys);
  }
};

test("plans API returns batched Checklist, Schedule and Timeline summaries without leaking related documents", async () => {
  const { calls, payload } = createPayload({
    plans: [{
      agentBrief: "do not leak",
      id: 1,
      progress: 40,
      prompt: "hidden",
      secret: "plan-secret",
      status: "active",
      title: "Launch plan",
      updatedAt: "2026-07-01T10:00:00.000Z",
    }],
    checklists: [
      { groups: [{ secret: "group-secret" }], id: 11, planId: 1, prompt: "hidden", title: "  Launch checklist  " },
      { groups: [], id: 11, planId: 1, title: "duplicate" },
      { id: -3, planId: 1, title: "invalid id" },
      { id: 12, planId: 1, title: "   " },
    ],
    "schedule-items": [
      { date: "2026-07-04T05:00:00.000Z", description: "private", id: 21, relatedPlan: 1, secret: "schedule-secret", status: "planned", title: "Daily sync" },
      { date: "not-a-date", id: 22, relatedPlan: 1, status: "planned", title: "Bad date" },
    ],
    "timeline-events": [
      { description: "private", eventDate: "2026-07-05T09:00:00.000Z", id: 31, relatedPlan: 1, secret: "timeline-secret", status: "published", title: "Milestone" },
      { eventDate: "2026-07-06T09:00:00.000Z", id: 31, relatedPlan: 1, status: "draft", title: "duplicate" },
    ],
  });
  const plans = await loadPlanSummaries(payload);

  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].linkedObjects, [
    { id: 11, title: "Launch checklist", type: "checklist" },
    { date: "2026-07-04", id: 21, status: "planned", title: "Daily sync", type: "schedule" },
    { date: "2026-07-05", id: 31, status: "published", title: "Milestone", type: "timeline" },
  ]);
  assert.deepEqual(
    Object.keys(plans[0]).sort(),
    ["agentState", "checklists", "createdAt", "id", "linkedObjects", "progress", "scheduleItems", "state", "status", "title", "updatedAt"],
  );
  assertLinkedSummaryKeys(plans[0].linkedObjects as Array<Record<string, unknown>>);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.collection), ["plans", "checklists", "schedule-items", "timeline-events"]);
});

test("checklist API returns its owning Plan plus batched Schedule and Timeline summaries", async () => {
  const { calls, payload } = createPayload({
    checklists: [{
      groups: [{ items: [{ id: "g1-i1", isCompleted: true, secret: "item-secret", title: "Ship" }], prompt: "hidden" }],
      id: 11,
      planId: { id: 1, secret: "populated-secret" },
      status: "published",
      title: "Launch checklist",
    }],
    plans: [{ description: "private", id: 1, secret: "plan-secret", title: "Launch plan" }],
    "schedule-items": [
      { date: new Date("2026-07-04T00:00:00.000Z"), id: 21, relatedChecklist: 11, status: "done", title: "Ship slot" },
      { date: "2026-07-04", id: 21, relatedChecklist: 11, status: "done", title: "duplicate" },
    ],
    "timeline-events": [{ eventDate: "2026-07-05T09:00:00.000Z", id: 31, relatedChecklist: 11, status: "published", title: "Shipped" }],
  });
  const checklists = await loadChecklistSummaries(payload, { filterStatus: "done", limit: 20 });

  assert.deepEqual(checklists[0].linkedObjects, [
    { id: 1, title: "Launch plan", type: "plan" },
    { date: "2026-07-04", id: 21, status: "done", title: "Ship slot", type: "schedule" },
    { date: "2026-07-05", id: 31, status: "published", title: "Shipped", type: "timeline" },
  ]);
  assert.deepEqual(
    Object.keys(checklists[0]).sort(),
    ["completedItems", "id", "items", "linkedObjects", "relatedPlan", "status", "title", "totalItems"],
  );
  assertLinkedSummaryKeys(checklists[0].linkedObjects as Array<Record<string, unknown>>);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.collection), ["checklists", "plans", "schedule-items", "timeline-events"]);
});

test("schedule API returns Plan, Checklist and completion Timeline summaries while retaining its view fields", async () => {
  const { calls, payload } = createPayload({
    "schedule-items": [{
      category: "work",
      conflictNote: "none",
      date: "2026-07-04T00:00:00.000Z",
      description: "Visible own description",
      endTime: "10:00",
      id: 21,
      priority: "high",
      prompt: "hidden",
      relatedChecklist: 11,
      relatedChecklistItemKey: "1-1-Ship",
      relatedPlan: 1,
      sourceType: "agent",
      startTime: "09:00",
      status: "done",
      title: "Ship slot",
    }],
    plans: [{ id: 1, secret: "plan-secret", title: "Launch plan" }],
    checklists: [{ groups: [{ secret: "group-secret" }], id: 11, title: "Launch checklist" }],
    "timeline-events": [
      { eventDate: "2026-07-05T09:00:00.000Z", id: 31, relatedScheduleItem: 21, status: "published", title: "Shipped" },
      { eventDate: "2026-07-05T09:00:00.000Z", id: 31, relatedScheduleItem: 21, status: "published", title: "duplicate" },
    ],
  });
  const items = await loadScheduleSummaries(payload, {
    monthEnd: "2026-07-31",
    monthStart: "2026-07-01",
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0].linkedObjects, [
    { id: 1, title: "Launch plan", type: "plan" },
    { id: 11, title: "Launch checklist", type: "checklist" },
    { date: "2026-07-05", id: 31, status: "published", title: "Shipped", type: "timeline" },
  ]);
  assert.deepEqual(
    Object.keys(items[0]).sort(),
    ["category", "conflictNote", "date", "description", "endTime", "id", "linkedObjects", "planId", "priority", "relatedChecklist", "relatedChecklistItemKey", "relatedPlan", "sourceType", "startTime", "status", "title"],
  );
  assertLinkedSummaryKeys(items[0].linkedObjects as Array<Record<string, unknown>>);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.collection), ["schedule-items", "plans", "checklists", "timeline-events"]);
});

test("timeline API returns Plan, Checklist and Schedule summaries with normalized dates and statuses", async () => {
  const { calls, payload } = createPayload({
    "timeline-events": [{
      description: "Visible own description",
      eventDate: "2026-07-05T09:00:00.000Z",
      id: 31,
      prompt: "hidden",
      relatedChecklist: 11,
      relatedPlan: 1,
      relatedScheduleItem: { id: 21, secret: "populated-secret" },
      sourceType: "schedule",
      status: "published",
      title: "Shipped",
      type: "milestone",
    }],
    plans: [{ id: 1, secret: "plan-secret", title: "Launch plan" }],
    checklists: [{ groups: [{ secret: "group-secret" }], id: 11, title: "Launch checklist" }],
    "schedule-items": [{ date: "2026-07-04T00:00:00.000Z", description: "private", id: 21, status: "done", title: "Ship slot" }],
  });
  const events = await loadTimelineSummaries(payload, {
    limit: 50,
    monthEnd: "2026-07-31T23:59:59.999Z",
    monthStart: "2026-07-01T00:00:00.000Z",
  });

  assert.deepEqual(events[0].linkedObjects, [
    { id: 1, title: "Launch plan", type: "plan" },
    { id: 11, title: "Launch checklist", type: "checklist" },
    { date: "2026-07-04", id: 21, status: "done", title: "Ship slot", type: "schedule" },
  ]);
  assert.deepEqual(
    Object.keys(events[0]).sort(),
    ["date", "description", "id", "linkedObjects", "sourceType", "title", "type"],
  );
  assertLinkedSummaryKeys(events[0].linkedObjects as Array<Record<string, unknown>>);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.collection), ["timeline-events", "plans", "checklists", "schedule-items"]);
});

test("all four APIs omit missing, inaccessible and malformed relationships", async () => {
  const cases: Array<{
    docs: Record<string, Array<Record<string, unknown>>>;
    load: (payload: ReturnType<typeof createPayload>["payload"]) => Promise<Array<Record<string, unknown>>>;
    name: string;
  }> = [
    {
      docs: {
        plans: [{ id: 1, title: "Plan" }],
        checklists: [{ id: 0, planId: 1, title: "bad" }],
        "schedule-items": [{ date: "2026-07-04garbage", id: 22, relatedPlan: 1, title: "bad" }],
        "timeline-events": [],
      },
      load: loadPlanSummaries,
      name: "plans",
    },
    {
      docs: {
        checklists: [{ groups: [], id: 11, planId: 999, status: "published", title: "Checklist" }],
        plans: [],
        "schedule-items": [{ date: "2026-07-04", id: "bad" as unknown as number, relatedChecklist: 11, title: "bad" }],
        "timeline-events": [],
      },
      load: (payload) => loadChecklistSummaries(payload, { filterStatus: "", limit: 20 }),
      name: "checklists",
    },
    {
      docs: {
        "schedule-items": [{ date: "2026-07-04", id: 21, relatedChecklist: -1, relatedPlan: 999, status: "planned", title: "Schedule" }],
        plans: [],
        checklists: [],
        "timeline-events": [{ eventDate: null, id: 31, relatedScheduleItem: 21, title: "bad" }],
      },
      load: (payload) => loadScheduleSummaries(payload, { monthEnd: "2026-07-31", monthStart: "2026-07-01" }),
      name: "items",
    },
    {
      docs: {
        "timeline-events": [{ eventDate: "2026-07-05", id: 31, relatedChecklist: 999, relatedPlan: { id: "bad" }, relatedScheduleItem: 404, title: "Timeline", type: "milestone" }],
        plans: [],
        checklists: [],
        "schedule-items": [],
      },
      load: (payload) => loadTimelineSummaries(payload, {
        limit: 50,
        monthEnd: "2026-07-31T23:59:59.999Z",
        monthStart: "2026-07-01T00:00:00.000Z",
      }),
      name: "events",
    },
  ];

  for (const scenario of cases) {
    const { payload } = createPayload(scenario.docs);
    const results = await scenario.load(payload);
    assert.deepEqual(results[0].linkedObjects, [], scenario.name);
  }
});
