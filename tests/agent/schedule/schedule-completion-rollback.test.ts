import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { executeRollbackFromPayload } from "../../../src/lib/agent/rollback";

type Document = Record<string, unknown> & { id: number };

type State = {
  checklist: Document | null;
  events: Document[];
  plan: Document | null;
  schedule: Document | null;
};

type Operation = {
  args: Record<string, unknown>;
  type: "delete" | "findByID" | "update";
};

const beforeGroups = [
  {
    items: [
      {
        completedAt: null,
        completionNote: null,
        id: "item-release",
        isCompleted: false,
        title: "发布",
      },
    ],
    title: "阶段",
  },
];

const afterGroups = [
  {
    items: [
      {
        completedAt: "2026-07-28T09:30:00.000Z",
        completionNote: null,
        id: "item-release",
        isCompleted: true,
        title: "发布",
      },
    ],
    title: "阶段",
  },
];

const beforeSchedule = {
  date: "2026-07-28T00:00:00.000Z",
  isAllDay: false,
  priority: "medium",
  relatedChecklist: 501,
  relatedChecklistItemKey: "item-release",
  relatedPlan: 77,
  sourceType: "manual",
  status: "planned",
  title: "发布回归",
};

const afterSchedule = {
  ...beforeSchedule,
  status: "done",
};

const beforeChecklistTimeline = {
  description: "原清单记录",
  eventDate: "2026-07-27T09:30:00.000Z",
  isFeatured: true,
  relatedChecklist: 501,
  relatedPlan: 77,
  relatedPost: null,
  relatedScheduleItem: null,
  relatedTaskKey: "item-release",
  relatedUpdate: null,
  sortOrder: 3,
  sourceType: "checklist",
  status: "draft",
  title: "原清单记录",
  type: "project",
  visibility: "private",
};

const afterChecklistTimeline = {
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
};

const afterScheduleTimeline = {
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
};

const unrelatedPlanLink = { relationTo: "notes", value: 990 };
const scheduleTimelineLink = { relationTo: "timeline-events", value: 801 };
const checklistTimelineLink = { relationTo: "timeline-events", value: 802 };

const rollbackPayload = {
  afterSnapshot: {
    checklistGroups: afterGroups,
    checklistTimelineEvent: afterChecklistTimeline,
    schedule: afterSchedule,
    timelineEvent: afterScheduleTimeline,
  },
  beforeSnapshot: {
    checklistCompletion: {
      beforeSnapshot: {
        groups: beforeGroups,
        planLinkChanged: true,
        planLinkedContent: [unrelatedPlanLink, scheduleTimelineLink],
        timelineEvent: {
          id: 802,
          ...beforeChecklistTimeline,
        },
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 501,
        planId: 77,
        timelineEventId: 802,
      },
    },
    checklistGroups: beforeGroups,
    schedule: beforeSchedule,
    schedulePlanLink: {
      afterLinkedContent: [unrelatedPlanLink, scheduleTimelineLink],
      beforeLinkedContent: [unrelatedPlanLink],
      changed: true,
      planId: 77,
    },
    timelineEvent: null,
  },
  strategy: "restore_schedule_completion",
  target: {
    checklistId: 501,
    itemId: 701,
    planId: 77,
    timelineEventId: 801,
  },
};

const completedState = (): State => ({
  checklist: {
    groups: structuredClone(afterGroups),
    id: 501,
    planId: 77,
    title: "发布清单",
  },
  events: [
    { id: 801, ...afterScheduleTimeline },
    { id: 802, ...afterChecklistTimeline },
  ],
  plan: {
    id: 77,
    linkedContent: [
      structuredClone(unrelatedPlanLink),
      structuredClone(scheduleTimelineLink),
      structuredClone(checklistTimelineLink),
    ],
    title: "发布计划",
  },
  schedule: {
    id: 701,
    ...afterSchedule,
  },
});

let state: State;
let operations: Operation[];
let directOperations: number;
let transactionCommits: number;
let transactionRollbacks: number;
let failOnWrite: number | null;
let concurrentMutationBeforeFirstWrite: null | (() => void);
let concurrentCommittedState: State | null;
let receivedTransactionOptions: Record<string, unknown> | undefined;

const exactDocument = (collection: unknown, id: unknown): Document | null => {
  if (collection === "schedule-items") {
    return state.schedule?.id === id ? state.schedule : null;
  }
  if (collection === "checklists") {
    return state.checklist?.id === id ? state.checklist : null;
  }
  if (collection === "plans") {
    return state.plan?.id === id ? state.plan : null;
  }
  if (collection === "timeline-events") {
    return state.events.find((event) => event.id === id) ?? null;
  }
  return null;
};

const transactionPayload = () => {
  const outsideTransaction = async () => {
    directOperations += 1;
    throw new Error("rollback CRUD requires its transaction runner");
  };

  return {
    create: outsideTransaction,
    delete: outsideTransaction,
    findByID: outsideTransaction,
    runInTransaction: async (
      userId: number,
      operation: (payload: {
        create: (args: unknown) => Promise<unknown>;
        delete: (args: unknown) => Promise<unknown>;
        findByID: (args: unknown) => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
      }) => Promise<unknown>,
      options?: Record<string, unknown>,
    ) => {
      const snapshot = structuredClone(state);
      let writeCount = 0;
      receivedTransactionOptions = structuredClone(options);

      const recordWrite = () => {
        if (writeCount === 0 && concurrentMutationBeforeFirstWrite) {
          const mutate = concurrentMutationBeforeFirstWrite;
          concurrentMutationBeforeFirstWrite = null;
          mutate();
          concurrentCommittedState = structuredClone(state);
          const error = new Error(
            "could not serialize access due to concurrent update",
          ) as Error & { code: string };
          error.code = "40001";
          throw error;
        }
        writeCount += 1;
        if (writeCount === failOnWrite) {
          throw new Error("injected rollback write failure");
        }
      };

      const transactional = {
        create: async () => {
          throw new Error("unexpected create");
        },
        delete: async (rawArgs: unknown) => {
          const args = rawArgs as Record<string, unknown>;
          operations.push({ args: structuredClone(args), type: "delete" });
          recordWrite();
          assert.deepEqual(args.user, { collection: "users", id: userId });
          if (args.collection !== "timeline-events" || typeof args.id !== "number") {
            throw new Error("unexpected delete");
          }
          const index = state.events.findIndex((event) => event.id === args.id);
          if (index < 0) {
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
          const [deleted] = state.events.splice(index, 1);
          return structuredClone(deleted);
        },
        findByID: async (rawArgs: unknown) => {
          const args = rawArgs as Record<string, unknown>;
          operations.push({ args: structuredClone(args), type: "findByID" });
          assert.deepEqual(args.user, { collection: "users", id: userId });
          return structuredClone(exactDocument(args.collection, args.id));
        },
        update: async (rawArgs: unknown) => {
          const args = rawArgs as Record<string, unknown>;
          operations.push({ args: structuredClone(args), type: "update" });
          recordWrite();
          assert.deepEqual(args.user, { collection: "users", id: userId });
          const current = exactDocument(args.collection, args.id);
          if (!current || !args.data || typeof args.data !== "object" || Array.isArray(args.data)) {
            throw new Error("unexpected update");
          }
          Object.assign(current, args.data);
          return structuredClone(current);
        },
      };

      try {
        const result = await operation(transactional);
        transactionCommits += 1;
        return result;
      } catch (error) {
        state = concurrentCommittedState ?? snapshot;
        transactionRollbacks += 1;
        throw error;
      }
    },
    update: outsideTransaction,
  };
};

const execute = (payload: unknown = transactionPayload()) =>
  executeRollbackFromPayload(
    rollbackPayload,
    { payload: payload as never, persistAudit: false, userId: 9 },
  );

const writeOrder = () =>
  operations
    .filter((operation) => operation.type === "delete" || operation.type === "update")
    .map((operation) => `${operation.type}:${operation.args.collection}:${operation.args.id}`);

const reconciliationFailure = /divergent|无法安全回滚|(?:cannot|could not) be reconciled/i;

beforeEach(() => {
  state = completedState();
  operations = [];
  directOperations = 0;
  transactionCommits = 0;
  transactionRollbacks = 0;
  failOnWrite = null;
  concurrentMutationBeforeFirstWrite = null;
  concurrentCommittedState = null;
  receivedTransactionOptions = undefined;
});

test("restores the nested Checklist Timeline and both targeted Plan links in dependency-safe order", async () => {
  const result = await execute();

  assert.deepEqual(writeOrder(), [
    "update:plans:77",
    "update:timeline-events:802",
    "update:plans:77",
    "delete:timeline-events:801",
    "update:checklists:501",
    "update:schedule-items:701",
  ]);
  assert.equal(
    operations
      .filter((operation) => operation.type === "update")
      .every((operation) => operation.args.depth === 0),
    true,
  );
  assert.deepEqual(state.plan?.linkedContent, [unrelatedPlanLink]);
  assert.equal(state.events.some((event) => event.id === 801), false);
  assert.deepEqual(
    state.events.find((event) => event.id === 802),
    { id: 802, ...beforeChecklistTimeline },
  );
  assert.deepEqual(state.checklist?.groups, beforeGroups);
  assert.deepEqual(state.schedule, { id: 701, ...beforeSchedule });
  assert.equal(directOperations, 0);
  assert.equal(transactionCommits, 1);
  assert.equal(transactionRollbacks, 0);
  assert.deepEqual(
    result.affectedDocuments?.map(({ collection, documentId, operation }) => ({
      collection,
      documentId,
      operation,
    })),
    [
      { collection: "plans", documentId: 77, operation: "update" },
      { collection: "timeline-events", documentId: 802, operation: "update" },
      { collection: "timeline-events", documentId: 801, operation: "delete" },
      { collection: "checklists", documentId: 501, operation: "update" },
      { collection: "schedule-items", documentId: 701, operation: "update" },
    ],
  );
});

test("a repeated Schedule completion rollback commits without changing already-restored state", async () => {
  await execute();
  const restored = structuredClone(state);
  operations = [];

  const repeated = await execute();

  assert.deepEqual(state, restored);
  assert.deepEqual(writeOrder(), []);
  assert.deepEqual(repeated.affectedDocuments, []);
  assert.equal(transactionCommits, 2);
  assert.equal(transactionRollbacks, 0);
});

test("rejects divergent Schedule state before any reverse write", async () => {
  assert.ok(state.schedule);
  state.schedule.title = "用户后来改过的标题";
  const divergent = structuredClone(state);

  await assert.rejects(execute(), reconciliationFailure);

  assert.deepEqual(state, divergent);
  assert.deepEqual(writeOrder(), []);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("rejects divergent Checklist groups before any reverse write", async () => {
  assert.ok(state.checklist);
  state.checklist.groups = [{ items: [], title: "用户后来改过的分组" }];
  const divergent = structuredClone(state);

  await assert.rejects(execute(), reconciliationFailure);

  assert.deepEqual(state, divergent);
  assert.deepEqual(writeOrder(), []);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("rejects divergent outer Schedule Timeline state before any reverse write", async () => {
  state.events[0]!.title = "用户后来改过的时间线";
  const divergent = structuredClone(state);

  await assert.rejects(execute(), reconciliationFailure);

  assert.deepEqual(state, divergent);
  assert.deepEqual(writeOrder(), []);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("rejects divergent nested Checklist Timeline state before any reverse write", async () => {
  state.events[1]!.description = "用户后来改过的嵌套时间线";
  const divergent = structuredClone(state);

  await assert.rejects(execute(), reconciliationFailure);

  assert.deepEqual(state, divergent);
  assert.deepEqual(writeOrder(), []);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("an injected mid-rollback failure rolls back every reverse write", async () => {
  const completed = structuredClone(state);
  failOnWrite = 3;

  await assert.rejects(execute(), /rollback|reconciled|安全/i);

  assert.deepEqual(state, completed);
  assert.equal(directOperations, 0);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("a concurrent user write after preflight aborts serializable rollback without overwriting it", async () => {
  const expected = completedState();
  assert.ok(expected.schedule);
  expected.schedule.title = "并发用户修改";
  concurrentMutationBeforeFirstWrite = () => {
    assert.ok(state.schedule);
    state.schedule.title = "并发用户修改";
  };

  await assert.rejects(execute(), reconciliationFailure);

  assert.deepEqual(receivedTransactionOptions, {
    accessMode: "read write",
    isolationLevel: "serializable",
  });
  assert.deepEqual(state, expected);
  assert.equal(transactionCommits, 0);
  assert.equal(transactionRollbacks, 1);
});

test("missing Schedule rollback transaction support fails before direct CRUD", async () => {
  const transactionCapable = transactionPayload();
  const withoutTransaction = {
    create: transactionCapable.create,
    delete: transactionCapable.delete,
    findByID: transactionCapable.findByID,
    update: transactionCapable.update,
  };

  await assert.rejects(
    execute(withoutTransaction),
    /transaction.*unavailable|事务.*不可用/i,
  );

  assert.equal(directOperations, 0);
  assert.deepEqual(state, completedState());
});
