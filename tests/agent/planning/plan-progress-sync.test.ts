import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  syncPlanProgressOnChecklistChange,
  resolvePlanId,
} from "../../../src/collections/Checklist";
import { calculatePlanChecklistProgress } from "../../../src/lib/agent/planning/plan-checklist-progress";

/* ── Helpers ── */

const makeDoc = (overrides: Record<string, unknown> = {}) => ({
  id: 701,
  planId: null,
  status: "draft" as const,
  title: "Test Checklist",
  visibility: "private" as const,
  groups: [
    {
      title: "Group 1",
      items: [
        { id: "i1", isCompleted: false, title: "Item 1" },
        { id: "i2", isCompleted: false, title: "Item 2" },
      ],
    },
  ],
  ...overrides,
});

type DocArg = ReturnType<typeof makeDoc>;

/* Payload mock that records update calls */
type StubHandlers = {
  findByID: (args: { collection: string; id: number }) => Promise<unknown>;
  find: (args: { collection: string; where?: Record<string, unknown> }) => Promise<unknown>;
  update: (args: { collection: string; data: Record<string, unknown>; id: number }) => Promise<unknown>;
};

const makeStubs = (overrides: Partial<StubHandlers> = {}) => {
  const ops: Array<{ type: string; args: unknown }> = [];
  return {
    handlers: {
      findByID: async (args: { collection: string; id: number }) => {
        throw new Error("findByID not stubbed");
      },
      find: async (args: { collection: string; where?: Record<string, unknown> }) => {
        throw new Error("find not stubbed");
      },
      update: async (args: { collection: string; data: Record<string, unknown>; id: number }) => {
        ops.push({ type: "update", args });
        return { id: args.id, ...args.data };
      },
      ...overrides,
    } satisfies StubHandlers,
    ops,
  };
};

type HookArgs = Parameters<typeof syncPlanProgressOnChecklistChange>[0];

const callHook = async (
  doc: DocArg,
  previousDoc: DocArg | null,
  stubs: ReturnType<typeof makeStubs>,
  overrides: Partial<{ context: Record<string, unknown>; operation: string }> = {},
) =>
  syncPlanProgressOnChecklistChange({
    collection: {} as HookArgs["collection"],
    context: {} as HookArgs["context"],
    data: {} as HookArgs["data"],
    doc: doc as HookArgs["doc"],
    operation: (overrides.operation ?? "update") as HookArgs["operation"],
    previousDoc: (previousDoc ?? doc) as HookArgs["previousDoc"],
    req: {
      context: overrides.context ?? ({} as Record<string, unknown>),
      payload: {
        findByID: stubs.handlers.findByID,
        find: stubs.handlers.find,
        update: stubs.handlers.update,
      },
    } as HookArgs["req"],
  });

beforeEach(() => {
  /* clean — no global stubs needed */
});

/* ── resolvePlanId ── */

test("resolvePlanId returns number when planId is a number", () => {
  assert.equal(resolvePlanId(makeDoc({ planId: 88 })), 88);
});

test("resolvePlanId returns id from populated object", () => {
  assert.equal(resolvePlanId(makeDoc({ planId: { id: 99 } })), 99);
});

test("resolvePlanId returns null when planId is null", () => {
  assert.equal(resolvePlanId(makeDoc({ planId: null })), null);
});

test("resolvePlanId returns null when planId is undefined", () => {
  assert.equal(resolvePlanId(makeDoc({ planId: undefined })), null);
});

/* ── Hook skips ── */

test("hook skips when checklist has no planId", async () => {
  const stubs = makeStubs();
  const doc = makeDoc({ planId: null });
  await callHook(doc, doc, stubs);

  assert.equal(stubs.ops.length, 0, "no plan update should occur");
});

test("hook skips when operation is create (no previousDoc)", async () => {
  const stubs = makeStubs();
  await syncPlanProgressOnChecklistChange({
    collection: {} as HookArgs["collection"],
    context: {} as HookArgs["context"],
    data: {} as HookArgs["data"],
    doc: makeDoc({ planId: 88 }) as HookArgs["doc"],
    operation: "create",
    previousDoc: undefined,
    req: {
      context: {} as Record<string, unknown>,
      payload: {
        findByID: stubs.handlers.findByID,
        find: stubs.handlers.find,
        update: stubs.handlers.update,
      },
    } as HookArgs["req"],
  });

  assert.equal(stubs.ops.length, 0, "create should not trigger progress sync");
});

test("hook skips when context flag is set", async () => {
  const stubs = makeStubs();
  const doc = makeDoc({ planId: 88 });
  await callHook(doc, doc, stubs, {
    context: { skipChecklistPlanProgressSync: true },
  });

  assert.equal(stubs.ops.length, 0, "skip context flag should block update");
});

/* ── Progress calculations ── */

test("1/2 completed → progress 50", async () => {
  const stubs = makeStubs({
    findByID: async () => ({ id: 88, progress: 0 }),
    find: async () => ({
      docs: [
        makeDoc({
          id: 701,
          planId: 88,
          groups: [{ title: "G1", items: [
            { id: "i1", isCompleted: true, title: "Done" },
            { id: "i2", isCompleted: false, title: "Todo" },
          ] }],
        }),
      ],
      totalDocs: 1,
    }),
  });

  const doc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: true, title: "Done" },
      { id: "i2", isCompleted: false, title: "Todo" },
    ] }],
  });
  const previousDoc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: false, title: "Done" },
      { id: "i2", isCompleted: false, title: "Todo" },
    ] }],
  });

  await callHook(doc, previousDoc, stubs);

  assert.equal(stubs.ops.length, 1, "plan update should occur");
  assert.equal(
    (stubs.ops[0]?.args as { data?: Record<string, unknown> })?.data?.progress,
    50,
    "progress should be 50",
  );
});

test("2/2 completed → progress 100", async () => {
  const stubs = makeStubs({
    findByID: async () => ({ id: 88, progress: 50 }),
    find: async () => ({
      docs: [
        makeDoc({
          id: 701,
          planId: 88,
          groups: [{ title: "G1", items: [
            { id: "i1", isCompleted: true, title: "Done" },
            { id: "i2", isCompleted: true, title: "Done" },
          ] }],
        }),
      ],
      totalDocs: 1,
    }),
  });

  const doc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: true, title: "Done" },
      { id: "i2", isCompleted: true, title: "Done" },
    ] }],
  });
  const previousDoc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: true, title: "Done" },
      { id: "i2", isCompleted: false, title: "Done" },
    ] }],
  });

  await callHook(doc, previousDoc, stubs);

  assert.equal(stubs.ops.length, 1);
  assert.equal(
    (stubs.ops[0]?.args as { data?: Record<string, unknown> })?.data?.progress,
    100,
    "progress should be 100",
  );
});

test("transaction-bound hook reads completed Checklist and writes Plan through the originating req", async () => {
  const previousDoc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{
      items: [{ id: "i1", isCompleted: false, title: "Todo" }],
      title: "G1",
    }],
  });
  const completedDoc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{
      items: [{ id: "i1", isCompleted: true, title: "Done" }],
      title: "G1",
    }],
  });
  const calls: Array<{ args: Record<string, unknown>; type: string }> = [];
  const transactionReq = {
    context: {},
    payload: {
      findByID: async (args: Record<string, unknown>) => {
        calls.push({ args, type: "findByID" });
        return { id: 88, progress: 0 };
      },
      find: async (args: Record<string, unknown>) => {
        calls.push({ args, type: "find" });
        const checklistVisibleInThisTransaction =
          args.req === transactionReq ? completedDoc : previousDoc;
        return { docs: [checklistVisibleInThisTransaction], totalDocs: 1 };
      },
      update: async (args: Record<string, unknown>) => {
        calls.push({ args, type: "update" });
        return { id: args.id, ...(args.data as Record<string, unknown>) };
      },
    },
  } as unknown as HookArgs["req"];

  await syncPlanProgressOnChecklistChange({
    collection: {} as HookArgs["collection"],
    context: {} as HookArgs["context"],
    data: {} as HookArgs["data"],
    doc: completedDoc as HookArgs["doc"],
    operation: "update",
    previousDoc: previousDoc as HookArgs["previousDoc"],
    req: transactionReq,
  });

  const planUpdate = calls.find((call) => call.type === "update");
  assert.equal(
    (planUpdate?.args.data as { progress?: unknown } | undefined)?.progress,
    100,
    "the hook must aggregate the Checklist state visible inside the Schedule transaction",
  );
  assert.ok(
    calls.every((call) => call.args.req === transactionReq),
    "all nested Payload reads and writes must remain bound to the originating transaction req",
  );
});

test("0/2 completed (rollback / uncomplete) → progress 0", async () => {
  const stubs = makeStubs({
    findByID: async () => ({ id: 88, progress: 50 }),
    find: async () => ({
      docs: [
        makeDoc({
          id: 701,
          planId: 88,
          groups: [{ title: "G1", items: [
            { id: "i1", isCompleted: false, title: "Todo" },
            { id: "i2", isCompleted: false, title: "Todo" },
          ] }],
        }),
      ],
      totalDocs: 1,
    }),
  });

  const doc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: false, title: "Todo" },
      { id: "i2", isCompleted: false, title: "Todo" },
    ] }],
  });
  const previousDoc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: true, title: "Todo" },
      { id: "i2", isCompleted: true, title: "Todo" },
    ] }],
  });

  await callHook(doc, previousDoc, stubs);

  assert.equal(stubs.ops.length, 1);
  assert.equal(
    (stubs.ops[0]?.args as { data?: Record<string, unknown> })?.data?.progress,
    0,
    "progress should be 0 after uncomplete",
  );
});

test("hook skips write when progress has not changed", async () => {
  const stubs = makeStubs({
    findByID: async () => ({ id: 88, progress: 50 }),
    find: async () => ({
      docs: [
        makeDoc({
          id: 701,
          planId: 88,
          groups: [{ title: "G1", items: [
            { id: "i1", isCompleted: true, title: "Done" },
            { id: "i2", isCompleted: false, title: "Todo" },
          ] }],
        }),
      ],
      totalDocs: 1,
    }),
  });

  const doc = makeDoc({
    id: 701,
    planId: 88,
    groups: [{ title: "G1", items: [
      { id: "i1", isCompleted: true, title: "Done" },
      { id: "i2", isCompleted: false, title: "Todo" },
    ] }],
  });

  await callHook(doc, doc, stubs);

  assert.equal(stubs.ops.length, 0, "no redundant plan update when progress unchanged");
});

/* ── Progress aggregation across checklists ── */

test("calculates progress across all checklists linked via planId", () => {
  const checklists = [
    makeDoc({ id: 701, planId: 88, groups: [{ title: "G", items: [
      { id: "a1", isCompleted: true, title: "Done" },
      { id: "a2", isCompleted: false, title: "Todo" },
    ] }] }),
    makeDoc({ id: 702, planId: 88, groups: [{ title: "G", items: [
      { id: "b1", isCompleted: true, title: "Done" },
      { id: "b2", isCompleted: false, title: "Todo" },
    ] }] }),
    makeDoc({ id: 703, planId: 88, groups: [{ title: "G", items: [
      { id: "c1", isCompleted: true, title: "Done" },
      { id: "c2", isCompleted: true, title: "Done" },
    ] }] }),
  ];

  const result = calculatePlanChecklistProgress({
    checklists: checklists.map((cl) => ({ groups: cl.groups, id: cl.id })),
  });

  assert.equal(result.completedItems, 4);
  assert.equal(result.totalItems, 6);
  assert.ok(Math.abs(result.completionRate - (4 / 6) * 100) < 0.01);
  assert.equal(result.linkedChecklistCount, 3);
});

test("multiple checklists under same plan syncs correct aggregate progress", async () => {
  const stubs = makeStubs({
    findByID: async () => ({ id: 88, progress: 0 }),
    find: async () => ({
      docs: [
        makeDoc({ id: 701, planId: 88, groups: [{ title: "G", items: [
          { id: "a1", isCompleted: true, title: "X" },
          { id: "a2", isCompleted: false, title: "Y" },
        ] }] }),
        makeDoc({ id: 702, planId: 88, groups: [{ title: "G", items: [
          { id: "b1", isCompleted: true, title: "Z" },
          { id: "b2", isCompleted: true, title: "W" },
        ] }] }),
      ],
      totalDocs: 2,
    }),
  });

  const doc = makeDoc({ id: 702, planId: 88, groups: [{ title: "G", items: [
    { id: "b1", isCompleted: true, title: "Z" },
    { id: "b2", isCompleted: true, title: "W" },
  ] }] });

  await callHook(doc, doc, stubs);

  assert.equal(stubs.ops.length, 1);
  /* 3/4 items completed → 75 */
  assert.equal(
    (stubs.ops[0]?.args as { data?: Record<string, unknown> })?.data?.progress,
    75,
    "progress should aggregate across all planId-linked checklists",
  );
});
