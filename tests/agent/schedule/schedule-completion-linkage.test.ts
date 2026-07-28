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
let operations: Array<{ collection: string; data?: Record<string, unknown>; depth?: unknown; request?: unknown; type: string; where?: unknown }>;
let transactionCommits: number;
let transactionKills: number;
let failurePoint: null | "checklist" | "schedule-plan" | "task4-plan";
let populateScheduleRelationsOnWrite: boolean;

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
  transactionCommits = 0;
  transactionKills = 0;
  failurePoint = null;
  populateScheduleRelationsOnWrite = false;
};

const payload = (): ScheduleCompletionPayload => ({
  create: async (args) => {
    operations.push({ collection: args.collection, data: args.data, request: (args as { req?: unknown }).req, type: "create" });
    const event = { id: state.nextEventId++, ...args.data };
    state.events.push(event);
    return structuredClone(event);
  },
  delete: async (args) => {
    operations.push({ collection: args.collection, request: (args as { req?: unknown }).req, type: "delete" });
    state.events = state.events.filter((event) => event.id !== args.id);
    return { id: args.id };
  },
  find: async (args) => {
    operations.push({ collection: args.collection, request: (args as { req?: unknown }).req, type: "find", where: args.where });
    const where = args.where as { and?: Array<{ relatedChecklist?: { equals?: number }; relatedTaskKey?: { equals?: string } }>; relatedScheduleItem?: { equals?: number } };
    const matches = where.and
      ? state.events.filter((event) => event.relatedChecklist === where.and?.[0]?.relatedChecklist?.equals && event.relatedTaskKey === where.and?.[1]?.relatedTaskKey?.equals)
      : state.events.filter((event) => event.relatedScheduleItem === where.relatedScheduleItem?.equals);
    return { docs: structuredClone(matches), totalDocs: matches.length };
  },
  findByID: async (args) => {
    operations.push({ collection: args.collection, request: (args as { req?: unknown }).req, type: "findByID" });
    const source = args.collection === "schedule-items" ? state.schedule
      : args.collection === "checklists" ? state.checklist
      : args.collection === "plans" ? state.plan
      : state.events.find((event) => event.id === args.id);
    return source && source.id === args.id ? structuredClone(source) : null;
  },
  update: async (args) => {
    operations.push({ collection: args.collection, data: args.data, depth: args.depth, request: (args as { req?: unknown }).req, type: "update" });
    const linkedContent = args.collection === "plans" ? args.data.linkedContent as Array<{ value?: unknown }> : null;
    if (failurePoint === "schedule-plan" && args.collection === "plans" && linkedContent?.some((link) => link.value === 801)) throw new Error("schedule plan write failed");
    if (failurePoint === "checklist" && args.collection === "checklists") throw new Error("checklist write failed");
    if (failurePoint === "task4-plan" && args.collection === "plans" && linkedContent?.some((link) => link.value === 802)) throw new Error("task4 plan write failed");
    if (args.collection === "schedule-items") state.schedule = { ...state.schedule, ...args.data };
    if (args.collection === "checklists") state.checklist = { ...state.checklist, ...args.data };
    if (args.collection === "timeline-events") state.events = state.events.map((event) => event.id === args.id ? { ...event, ...args.data } : event);
    if (args.collection === "plans") state.plan = { ...state.plan, ...args.data };
    if (args.collection === "schedule-items" && populateScheduleRelationsOnWrite) {
      return structuredClone({
        ...state.schedule,
        relatedChecklist: { id: 501, title: "发布清单" },
        relatedPlan: { id: 77, title: "发布计划" },
      });
    }
    return structuredClone(args.collection === "schedule-items" ? state.schedule : args.collection === "plans" ? state.plan : args.collection === "checklists" ? state.checklist : state.events.find((event) => event.id === args.id));
  },
});

const transactionalPayload = (): ScheduleCompletionPayload => {
  const base = payload();
  return {
    ...base,
    runInTransaction: async (actor, operation) => {
      const snapshot = structuredClone(state);
      const req = { transactionID: "schedule-completion-test", user: { id: actor.userId } };
      const withRequest = <T extends Record<string, unknown>>(args: T) => ({ ...args, req });
      const transactionPayload: ScheduleCompletionPayload = {
        create: (args) => base.create(withRequest(args) as never),
        delete: (args) => base.delete(withRequest(args) as never),
        find: (args) => base.find(withRequest(args) as never),
        findByID: (args) => base.findByID(withRequest(args) as never),
        isTransactional: true,
        update: (args) => base.update(withRequest(args) as never),
      };
      try {
        const result = await operation(transactionPayload);
        if (result.ok) transactionCommits += 1;
        else {
          state = snapshot;
          transactionKills += 1;
        }
        return result;
      } catch (error) {
        state = snapshot;
        transactionKills += 1;
        throw error;
      }
    },
  };
};

const complete = (overrides: Record<string, unknown> = {}) => completeScheduleItem({
  actor: { isAdministrator: true, userId: 9 },
  completedAt: "2026-07-28T09:30:00.000Z",
  itemId: 701,
  payload: transactionalPayload(),
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
  if (!result.ok) return;
  assert.equal(result.rollbackPayload.beforeSnapshot.checklistCompletion?.strategy, "restore_checklist_groups_and_timeline");
  assert.equal(result.rollbackPayload.beforeSnapshot.checklistCompletion?.target.timelineEventId, 802);
  assert.equal(result.affectedDocuments.filter((document) => document.collection === "timeline-events").length, 2);
});

test("records bounded post-execution snapshots for every mutable Schedule rollback resource", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };

  const result = await complete();

  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  const rollbackPayload = result.rollbackPayload as typeof result.rollbackPayload & {
    afterSnapshot?: {
      checklistGroups?: unknown;
      checklistTimelineEvent?: Record<string, unknown>;
      schedule?: Record<string, unknown>;
      timelineEvent?: Record<string, unknown>;
    };
  };
  assert.deepEqual(rollbackPayload.afterSnapshot?.schedule, {
    date: "2026-07-28T00:00:00.000Z",
    isAllDay: false,
    priority: "medium",
    relatedChecklist: 501,
    relatedChecklistItemKey: "item-release",
    sourceType: "manual",
    status: "done",
    title: "发布回归",
  });
  assert.deepEqual(rollbackPayload.afterSnapshot?.checklistGroups, [
    {
      items: [
        {
          completedAt: "2026-07-28T09:30:00.000Z",
          completionNote: null,
          description: null,
          id: "item-release",
          isCompleted: true,
          title: "发布",
        },
      ],
      title: "阶段",
    },
  ]);
  assert.deepEqual(rollbackPayload.afterSnapshot?.timelineEvent, {
    description: "完成日程：发布回归",
    eventDate: "2026-07-28T09:30:00.000Z",
    isFeatured: false,
    relatedChecklist: 501,
    relatedPlan: 77,
    relatedPost: null,
    relatedScheduleItem: 701,
    relatedTaskKey: null,
    relatedUpdate: null,
    sortOrder: 0,
    sourceType: "schedule",
    status: "published",
    title: "完成日程：发布回归",
    type: "project",
    visibility: "private",
  });
  assert.deepEqual(rollbackPayload.afterSnapshot?.checklistTimelineEvent, {
    description: "清单：发布清单\n分组：阶段\n条目：发布",
    eventDate: "2026-07-28T09:30:00.000Z",
    isFeatured: false,
    relatedChecklist: 501,
    relatedPlan: 77,
    relatedPost: null,
    relatedScheduleItem: null,
    relatedTaskKey: "item-release",
    relatedUpdate: null,
    sortOrder: 0,
    sourceType: "checklist",
    status: "draft",
    title: "完成清单项：发布",
    type: "project",
    visibility: "private",
  });
  assert.equal("id" in (rollbackPayload.afterSnapshot?.timelineEvent ?? {}), false);
  assert.equal("id" in (rollbackPayload.afterSnapshot?.checklistTimelineEvent ?? {}), false);
});

test("normalizes populated Schedule relationships in rollback evidence and requests a depth-zero write result", async () => {
  state.schedule = schedule({
    relatedChecklist: 501,
    relatedChecklistItemKey: "item-release",
    relatedPlan: 77,
  });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };
  populateScheduleRelationsOnWrite = true;

  const result = await complete();

  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.deepEqual(result.rollbackPayload.afterSnapshot.schedule.relatedChecklist, 501);
  assert.deepEqual(result.rollbackPayload.afterSnapshot.schedule.relatedPlan, 77);
  assert.equal(
    operations.find((operation) =>
      operation.collection === "schedule-items" && operation.type === "update"
    )?.depth,
    0,
  );
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

test("returns changed false only when the complete linked Schedule, Checklist Timelines, and both Plan links match", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };

  const first = await complete();
  const repeat = await complete();

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(repeat.ok, true, JSON.stringify(repeat));
  assert.equal(repeat.changed, false);
  assert.equal(state.events.filter((event) => event.relatedScheduleItem === 701).length, 1);
  assert.equal(state.events.filter((event) => event.relatedTaskKey === "item-release").length, 1);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === 801), true);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === 802), true);
});

test("does not call a mismatched event, patch, or missing Plan link idempotent", async () => {
  state.schedule = schedule({ relatedPlan: 77, status: "done" });
  state.events = [{ eventDate: "2026-07-01T00:00:00.000Z", id: 801, relatedPlan: 77, relatedScheduleItem: 701, sourceType: "schedule", status: "published", title: "旧完成记录", visibility: "private" }];

  const result = await complete({ additionalPatch: { title: "新标题" }, completedAt: "2026-07-28T09:30:00.000Z" });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(state.schedule.title, "新标题");
  assert.equal((state.plan.linkedContent as unknown[]).length > 0, true);
});

test("rejects invalid actors before every Payload operation", async () => {
  const result = await complete({ actor: { isAdministrator: true, userId: 0 } });

  assert.equal(result.ok, false);
  assert.equal(operations.length, 0);
});

test("commits only a successful operation and passes one authenticated transaction request to Plan calls", async () => {
  state.schedule = schedule({ relatedPlan: 77 });

  const result = await complete();

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(transactionCommits, 1);
  assert.equal(transactionKills, 0);
  const planCalls = operations.filter((operation) => operation.collection === "plans");
  assert.ok(planCalls.length >= 2);
  assert.ok(planCalls.every((operation) => operation.request === planCalls[0]?.request));
  assert.deepEqual(planCalls[0]?.request, { transactionID: "schedule-completion-test", user: { id: 9 } });
});

test("transaction fake restores every collection when its callback throws", async () => {
  const initial = structuredClone(state);
  const runner = transactionalPayload().runInTransaction;
  assert.ok(runner);

  await assert.rejects(
    runner({ isAdministrator: true, userId: 9 }, async () => {
      state.schedule.status = "done";
      state.events.push({ id: 801, relatedScheduleItem: 701 });
      state.plan.linkedContent = [{ relationTo: "timeline-events", value: 801 }];
      throw new Error("callback failure");
    }),
    /callback failure/u,
  );

  assert.deepEqual(state, initial);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionKills, 1);
});

test("rolls back the full snapshot when Schedule Plan linkage fails after the Schedule Timeline write", async () => {
  state.schedule = schedule({ relatedPlan: 77 });
  const initial = structuredClone(state);
  failurePoint = "schedule-plan";

  const result = await complete();

  assert.equal(result.ok, false);
  assert.deepEqual(state, initial);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionKills, 1);
});

test("rolls back the full snapshot when Checklist completion fails after the Schedule Plan link", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };
  const initial = structuredClone(state);
  failurePoint = "checklist";

  const result = await complete();

  assert.equal(result.ok, false);
  assert.deepEqual(state, initial);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionKills, 1);
});

test("rolls back the full snapshot when Task4 fails after creating its Timeline event", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };
  const initial = structuredClone(state);
  failurePoint = "task4-plan";

  const result = await complete();

  assert.equal(result.ok, false);
  assert.deepEqual(state, initial);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionKills, 1);
});

test("repairs missing linked Checklist Timeline state instead of reporting a false idempotent result", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };
  await complete();
  state.events = state.events.filter((event) => event.relatedTaskKey !== "item-release");
  state.plan.linkedContent = (state.plan.linkedContent as Array<{ value?: unknown }>).filter((link) => link.value !== 802);

  const repaired = await complete();

  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.changed, true);
  const repairedChecklistTimeline = state.events.filter((event) => event.relatedTaskKey === "item-release");
  assert.equal(repairedChecklistTimeline.length, 1);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === 801), true);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === repairedChecklistTimeline[0]?.id), true);
});

test("repairs a missing linked Checklist Plan link instead of reporting a false idempotent result", async () => {
  state.schedule = schedule({ relatedChecklist: 501, relatedChecklistItemKey: "item-release" });
  state.checklist = { createdAt: "x", groups: [{ items: [{ completedAt: null, completionNote: null, id: "item-release", isCompleted: false, title: "发布" }], title: "阶段" }], id: 501, planId: 77, slug: "release", status: "draft", title: "发布清单", updatedAt: "x", visibility: "private" };
  await complete();
  state.plan.linkedContent = (state.plan.linkedContent as Array<{ value?: unknown }>).filter((link) => link.value !== 802);

  const repaired = await complete();

  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.changed, true);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === 801), true);
  assert.equal((state.plan.linkedContent as Array<{ value?: unknown }>).some((link) => link.value === 802), true);
});
