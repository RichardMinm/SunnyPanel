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
  limit?: number;
  overrideAccess?: boolean;
  pagination?: boolean;
  sort?: string;
  user?: unknown;
  where?: Record<string, unknown>;
};

const persistedRelationId = (value: unknown) =>
  value && typeof value === "object"
    ? (value as { id?: unknown }).id
    : value;

const matchesWhere = (
  document: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean => {
  if (!where) {
    return true;
  }
  if (Array.isArray(where.and)) {
    return where.and.every((condition) =>
      condition !== null
      && typeof condition === "object"
      && matchesWhere(document, condition as Record<string, unknown>));
  }
  return Object.entries(where).every(([field, rawConstraint]) => {
    if (!rawConstraint || typeof rawConstraint !== "object") {
      return false;
    }
    const constraint = rawConstraint as Record<string, unknown>;
    const value = persistedRelationId(document[field]);
    if (Array.isArray(constraint.in)) {
      return constraint.in.includes(value);
    }
    if ("equals" in constraint) {
      return value === constraint.equals;
    }
    if (typeof value !== "string") {
      return false;
    }
    if (typeof constraint.greater_than_equal === "string" && value < constraint.greater_than_equal) {
      return false;
    }
    if (typeof constraint.less_than_equal === "string" && value > constraint.less_than_equal) {
      return false;
    }
    return true;
  });
};

const createPayload = (docsByCollection: Record<string, Array<Record<string, unknown>>>) => {
  const calls: FindArgs[] = [];
  return {
    calls,
    payload: {
      find: async (args: FindArgs) => {
        calls.push(args);
        const matching = (docsByCollection[args.collection] ?? [])
          .filter((document) => matchesWhere(document, args.where));
        const docs = typeof args.limit === "number"
          ? matching.slice(0, args.limit)
          : matching;
        return {
          docs,
          totalDocs: matching.length,
        };
      },
    },
  };
};

const actor = { collection: "users" as const, id: 7 };

const assertAuthorizedBatchedReads = (
  calls: FindArgs[],
  expected: Array<{
    collection: string;
    field?: string;
    limit?: number;
    reverse?: boolean;
  }>,
) => {
  assert.equal(calls.length, expected.length);
  for (const [index, call] of calls.entries()) {
    const expectation = expected[index];
    assert.equal(call.collection, expectation.collection, `call ${index}`);
    assert.equal(call.overrideAccess, false, call.collection);
    assert.equal(call.user, actor, call.collection);
    assert.equal(call.limit, expectation.limit, `${call.collection} limit`);
    const field = call.where
      ? Array.isArray(call.where.and)
        ? "and"
        : Object.keys(call.where)[0]
      : undefined;
    assert.equal(field, expectation.field, `${call.collection} where`);
    if (expectation.reverse) {
      assert.equal(call.pagination, false, `${call.collection} reverse pagination`);
      assert.equal("limit" in call, false, `${call.collection} reverse limit`);
    }
  }
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
  const plans = await loadPlanSummaries(payload, actor);

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
  assertAuthorizedBatchedReads(calls, [
    { collection: "plans", limit: 10 },
    { collection: "checklists", field: "planId", reverse: true },
    { collection: "schedule-items", field: "relatedPlan", reverse: true },
    { collection: "timeline-events", field: "relatedPlan", reverse: true },
  ]);
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
  const checklists = await loadChecklistSummaries(payload, actor, { filterStatus: "done", limit: 20 });

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
  assertAuthorizedBatchedReads(calls, [
    { collection: "checklists", field: "status", limit: 20 },
    { collection: "plans", field: "id", limit: 1 },
    { collection: "schedule-items", field: "relatedChecklist", reverse: true },
    { collection: "timeline-events", field: "relatedChecklist", reverse: true },
  ]);
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
  const items = await loadScheduleSummaries(payload, actor, {
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
  assertAuthorizedBatchedReads(calls, [
    { collection: "schedule-items", field: "and", limit: 200 },
    { collection: "plans", field: "id", limit: 1 },
    { collection: "checklists", field: "id", limit: 1 },
    { collection: "timeline-events", field: "relatedScheduleItem", reverse: true },
  ]);
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
  const events = await loadTimelineSummaries(payload, actor, {
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
  assertAuthorizedBatchedReads(calls, [
    { collection: "timeline-events", field: "and", limit: 50 },
    { collection: "plans", field: "id", limit: 1 },
    { collection: "checklists", field: "id", limit: 1 },
    { collection: "schedule-items", field: "id", limit: 1 },
  ]);
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
      load: (payload) => loadPlanSummaries(payload, actor),
      name: "plans",
    },
    {
      docs: {
        checklists: [{ groups: [], id: 11, planId: 999, status: "published", title: "Checklist" }],
        plans: [],
        "schedule-items": [{ date: "2026-07-04", id: "bad" as unknown as number, relatedChecklist: 11, title: "bad" }],
        "timeline-events": [],
      },
      load: (payload) => loadChecklistSummaries(payload, actor, { filterStatus: "", limit: 20 }),
      name: "checklists",
    },
    {
      docs: {
        "schedule-items": [{ date: "2026-07-04", id: 21, relatedChecklist: -1, relatedPlan: 999, status: "planned", title: "Schedule" }],
        plans: [],
        checklists: [],
        "timeline-events": [{ eventDate: null, id: 31, relatedScheduleItem: 21, title: "bad" }],
      },
      load: (payload) => loadScheduleSummaries(payload, actor, { monthEnd: "2026-07-31", monthStart: "2026-07-01" }),
      name: "items",
    },
    {
      docs: {
        "timeline-events": [{ eventDate: "2026-07-05", id: 31, relatedChecklist: 999, relatedPlan: { id: "bad" }, relatedScheduleItem: 404, title: "Timeline", type: "milestone" }],
        plans: [],
        checklists: [],
        "schedule-items": [],
      },
      load: (payload) => loadTimelineSummaries(payload, actor, {
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

test("an access-filtered related document is omitted instead of exposing its raw relationship", async () => {
  const calls: FindArgs[] = [];
  const inaccessibleSchedule = {
    date: "2026-07-04",
    id: 21,
    relatedPlan: 1,
    secret: "must-not-leak",
    status: "planned",
    title: "Private schedule",
  };
  const payload = {
    find: async (args: FindArgs) => {
      calls.push(args);
      if (args.collection === "plans") {
        return { docs: [{ id: 1, title: "Plan" }], totalDocs: 1 };
      }
      if (args.collection === "schedule-items") {
        const authorized = args.overrideAccess === false && args.user === actor;
        return {
          docs: authorized ? [] : [inaccessibleSchedule],
          totalDocs: authorized ? 0 : 1,
        };
      }
      return { docs: [], totalDocs: 0 };
    },
  };

  const plans = await loadPlanSummaries(payload, actor);

  assert.deepEqual(plans[0].linkedObjects, []);
  assertAuthorizedBatchedReads(calls, [
    { collection: "plans", limit: 10 },
    { collection: "checklists", field: "planId", reverse: true },
    { collection: "schedule-items", field: "relatedPlan", reverse: true },
    { collection: "timeline-events", field: "relatedPlan", reverse: true },
  ]);
});

test("linked date summaries reject incomplete, invalid or tailed ISO timestamps", async () => {
  const { payload } = createPayload({
    plans: [{ id: 1, title: "Plan" }],
    checklists: [],
    "schedule-items": [
      { date: "2026-07-04", id: 21, relatedPlan: 1, status: "planned", title: "Date only" },
      { date: "2026-07-05T09:30:00.000Z", id: 22, relatedPlan: 1, status: "planned", title: "UTC timestamp" },
      { date: "2026-07-06T09:30:00+08:00", id: 23, relatedPlan: 1, status: "planned", title: "Offset timestamp" },
      { date: "2026-07-07T", id: 31, relatedPlan: 1, status: "planned", title: "Incomplete" },
      { date: "2026-07-08Tgarbage", id: 32, relatedPlan: 1, status: "planned", title: "Garbage" },
      { date: "2026-07-09T25:00:00Z", id: 33, relatedPlan: 1, status: "planned", title: "Invalid hour" },
      { date: "2026-02-30T09:00:00Z", id: 34, relatedPlan: 1, status: "planned", title: "Invalid day" },
      { date: "2026-07-10T09:00:00Ztail", id: 35, relatedPlan: 1, status: "planned", title: "Tail" },
    ],
    "timeline-events": [],
  });

  const plans = await loadPlanSummaries(payload, actor);

  assert.deepEqual(plans[0].linkedObjects, [
    { date: "2026-07-04", id: 21, status: "planned", title: "Date only", type: "schedule" },
    { date: "2026-07-05", id: 22, status: "planned", title: "UTC timestamp", type: "schedule" },
    { date: "2026-07-06", id: 23, status: "planned", title: "Offset timestamp", type: "schedule" },
  ]);
});

test("reverse relationship batches return more than 200 matching documents in one unlimited query", async () => {
  const scheduleItems = Array.from({ length: 205 }, (_, index) => ({
    date: "2026-07-04",
    id: index + 1,
    relatedPlan: 1,
    status: "planned",
    title: `Schedule ${index + 1}`,
  }));
  const { calls, payload } = createPayload({
    plans: [{ id: 1, title: "Plan" }],
    checklists: [],
    "schedule-items": scheduleItems,
    "timeline-events": [],
  });

  const plans = await loadPlanSummaries(payload, actor);
  const linkedSchedules = plans[0].linkedObjects.filter((item) => item.type === "schedule");

  assert.equal(linkedSchedules.length, 205);
  assert.equal(linkedSchedules.at(-1)?.id, 205);
  assertAuthorizedBatchedReads(calls, [
    { collection: "plans", limit: 10 },
    { collection: "checklists", field: "planId", reverse: true },
    { collection: "schedule-items", field: "relatedPlan", reverse: true },
    { collection: "timeline-events", field: "relatedPlan", reverse: true },
  ]);
});

test("all four loaders omit malformed primary documents before projection", async () => {
  const planPayload = createPayload({
    plans: [
      { id: "bad" as unknown as number, title: "Bad id" },
      { id: 1, title: "   " },
      { id: 2, title: "Valid plan" },
    ],
  }).payload;
  const checklistPayload = createPayload({
    checklists: [
      { groups: [], id: "bad" as unknown as number, status: "published", title: "Bad id" },
      { groups: [], id: 11, status: "published", title: "" },
      { groups: [], id: 12, status: "published", title: "Valid checklist" },
    ],
  }).payload;
  const schedulePayload = createPayload({
    "schedule-items": [
      { date: "2026-07-04", id: "bad" as unknown as number, status: "planned", title: "Bad id" },
      { date: "2026-07-04", id: 21, status: "planned", title: " " },
      { date: "2026-07-04T25:00:00Z", id: 22, status: "planned", title: "Bad date" },
      { date: "2026-07-04", id: 23, status: "planned", title: "Valid schedule" },
    ],
  }).payload;
  const timelinePayload = createPayload({
    "timeline-events": [
      { eventDate: "2026-07-04", id: "bad" as unknown as number, title: "Bad id", type: "milestone" },
      { eventDate: "2026-07-04", id: 31, title: "", type: "milestone" },
      { eventDate: "2026-07-04Tgarbage", id: 32, title: "Bad date", type: "milestone" },
      { eventDate: "2026-07-04", id: 33, title: "Valid timeline", type: "milestone" },
    ],
  }).payload;

  const [plans, checklists, schedules, events] = await Promise.all([
    loadPlanSummaries(planPayload, actor),
    loadChecklistSummaries(checklistPayload, actor, { filterStatus: "", limit: 20 }),
    loadScheduleSummaries(schedulePayload, actor, { monthEnd: "2026-07-31", monthStart: "2026-07-01" }),
    loadTimelineSummaries(timelinePayload, actor, {
      limit: 50,
      monthEnd: "2026-07-31T23:59:59.999Z",
      monthStart: "2026-07-01T00:00:00.000Z",
    }),
  ]);

  assert.deepEqual(plans.map((item) => [item.id, item.title]), [[2, "Valid plan"]]);
  assert.deepEqual(checklists.map((item) => [item.id, item.title]), [[12, "Valid checklist"]]);
  assert.deepEqual(schedules.map((item) => [item.id, item.title, item.date]), [[23, "Valid schedule", "2026-07-04"]]);
  assert.deepEqual(events.map((item) => [item.id, item.title, item.date]), [[33, "Valid timeline", "2026-07-04"]]);
});
