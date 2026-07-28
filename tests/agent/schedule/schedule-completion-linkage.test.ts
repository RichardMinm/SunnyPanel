import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { completeScheduleItem, type ScheduleCompletionPayload } from "../../../src/lib/schedule/complete-schedule-item";

type State = {
  checklist: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  nextEventId: number;
  plan: Record<string, unknown>;
  schedule: Record<string, unknown>;
};

let state: State;
let operations: Array<{ collection: string; data?: Record<string, unknown>; type: string; where?: unknown }>;

const schedule = (overrides: Record<string, unknown> = {}) => ({
  createdAt: "2026-07-28T00:00:00.000Z",
  date: "2026-07-28T00:00:00.000Z",
  id: 701,
  isAllDay: false,
  priority: "medium",
  sourceType: "manual",
  status: "planned",
  title: "发布回归",
  updatedAt: "2026-07-28T00:00:00.000Z",
  ...overrides,
});

const setup = (input: Partial<State> = {}) => {
  state = {
    checklist: { createdAt: "x", groups: [], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" },
    events: [],
    nextEventId: 801,
    plan: { id: 77, linkedContent: [], title: "发布计划" },
    schedule: schedule(),
    ...input,
  };
  operations = [];
};

const payload = (): ScheduleCompletionPayload => ({
  create: async (args) => {
    operations.push({ collection: args.collection, data: args.data, type: "create" });
    const event = { id: state.nextEventId++, ...args.data };
    state.events.push(event);
    return structuredClone(event);
  },
  delete: async (args) => {
    operations.push({ collection: args.collection, type: "delete" });
    state.events = state.events.filter((event) => event.id !== args.id);
    return { id: args.id };
  },
  find: async (args) => {
    operations.push({ collection: args.collection, type: "find", where: args.where });
    const where = args.where as { relatedChecklist?: { equals?: number }; relatedScheduleItem?: { equals?: number } };
    const matches = where.relatedChecklist
      ? state.events.filter((event) => event.relatedChecklist === where.relatedChecklist?.equals && event.relatedTaskKey === (where as { and?: Array<{ relatedTaskKey?: { equals?: string } }> }).and?.[1]?.relatedTaskKey?.equals)
      : state.events.filter((event) => event.relatedScheduleItem === where.relatedScheduleItem?.equals);
    return { docs: structuredClone(matches), totalDocs: matches.length };
  },
  findByID: async (args) => {
    operations.push({ collection: args.collection, type: "findByID" });
    const source = args.collection === "schedule-items" ? state.schedule
      : args.collection === "checklists" ? state.checklist
      : args.collection === "plans" ? state.plan
      : state.events.find((event) => event.id === args.id);
    return source && source.id === args.id ? structuredClone(source) : null;
  },
  update: async (args) => {
    operations.push({ collection: args.collection, data: args.data, type: "update" });
    if (args.collection === "schedule-items") state.schedule = { ...state.schedule, ...args.data };
    if (args.collection === "checklists") state.checklist = { ...state.checklist, ...args.data };
    if (args.collection === "timeline-events") state.events = state.events.map((event) => event.id === args.id ? { ...event, ...args.data } : event);
    if (args.collection === "plans") state.plan = { ...state.plan, ...args.data };
    return structuredClone(args.collection === "schedule-items" ? state.schedule : args.collection === "plans" ? state.plan : args.collection === "checklists" ? state.checklist : state.events.find((event) => event.id === args.id));
  },
});

const complete = (overrides: Record<string, unknown> = {}) => completeScheduleItem({
  actor: { isAdministrator: true, userId: 9 },
  completedAt: "2026-07-28T09:30:00.000Z",
  itemId: 701,
  payload: payload(),
  ...overrides,
});

beforeEach(() => setup());

test("completes the exact linked Checklist item and derives its Plan", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };

  const result = await complete();

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.schedule.status, "done");
  assert.equal((state.checklist.groups as Array<{ items: Array<{ isCompleted: boolean }> }>)[0]?.items[0]?.isCompleted, true);
  assert.equal(state.events[0]?.relatedScheduleItem, 701);
  assert.equal(state.events[0]?.relatedPlan, 77);
  assert.equal((state.plan.linkedContent as Array<{ relationTo: string; value: number }>).filter((link) => link.value === 801).length, 1);
});

test("uses a valid Schedule Plan only when it does not conflict with the Checklist Plan", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release", relatedPlan: 88 });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };

  const result = await complete();

  assert.equal(result.ok, false);
  assert.equal(state.schedule.status, "planned");
  assert.equal(operations.filter((operation) => operation.type === "update").length, 0);
});

test("Plan-only completion does not mutate Plan progress and writes one Plan-linked Schedule event", async () => {
  state.schedule = schedule({ relatedPlan: 77 });
  state.plan = { id: 77, linkedContent: [], progress: 40, title: "发布计划" };

  const result = await complete();

  assert.equal(result.ok, true);
  assert.equal(state.plan.progress, 40);
  assert.equal(state.events[0]?.relatedPlan, 77);
  assert.equal(state.events[0]?.relatedScheduleItem, 701);
});

test("standalone completion only changes Schedule and its Schedule-keyed Timeline event", async () => {
  const result = await complete();

  assert.equal(result.ok, true);
  assert.equal(state.schedule.status, "done");
  assert.equal(state.events[0]?.relatedPlan, null);
  assert.equal(operations.some((operation) => operation.collection === "plans" && operation.type === "update"), false);
});

test("uses only the exact Schedule Timeline uniqueness query and is idempotent", async () => {
  await complete();
  const repeat = await complete();

  assert.equal(repeat.ok, true);
  assert.equal(repeat.changed, false);
  assert.equal(state.events.length, 1);
  const eventQuery = operations.find((operation) => operation.collection === "timeline-events" && operation.type === "find");
  assert.deepEqual(eventQuery?.where, { relatedScheduleItem: { equals: 701 } });
});

test("rejects invalid actors before every Payload operation", async () => {
  const result = await complete({ actor: { isAdministrator: true, userId: 0 } });

  assert.equal(result.ok, false);
  assert.equal(operations.length, 0);
});
