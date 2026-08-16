import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildAgentOpsSnapshot,
  type AgentOpsPayloadClient,
} from "../../../src/lib/agent/ops/snapshot";

type FindArgs = Parameters<AgentOpsPayloadClient["find"]>[0];

const read = (path: string) => readFileSync(path, "utf8");

function createFakePayload() {
  const calls: FindArgs[] = [];
  let writeCount = 0;

  const payload = {
    calls,
    create: () => {
      writeCount += 1;
      throw new Error("ops snapshot must not create records");
    },
    delete: () => {
      writeCount += 1;
      throw new Error("ops snapshot must not delete records");
    },
    find: async (args: FindArgs) => {
      calls.push(args);

      if (args.collection === "agent-runs") {
        return {
          docs: [
            {
              id: 101,
              agentRole: "plan",
              createdAt: "2026-07-03T08:00:00.000Z",
              durationMs: 1200,
              goal: "full prompt should stay private",
              model: "gpt-5",
              status: "succeeded",
              title: "Create plan",
              tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
              trace: { apiKey: "sk-live-secret" },
              workflow: "planning",
            },
            {
              id: 102,
              createdAt: "2026-07-03T08:01:00.000Z",
              durationMs: 900,
              model: "gpt-5-mini",
              status: "failed",
              steps: [{ level: "error", message: "tool failed without sensitive prompt" }],
              title: "Schedule failure",
              workflow: "automation",
            },
          ],
          totalDocs: 2,
        };
      }

      if (args.collection === "agent-action-receipts") {
        return {
          docs: [
            {
              id: 201,
              actionId: "action-create-plan",
              createdAt: "2026-07-03T08:02:00.000Z",
              error: null,
              intent: "create_plan",
              operation: "execute",
              response: { assistantMessage: "do not expose raw success body" },
              rollbackPayload: { internal: true },
              status: "succeeded",
              thread: 301,
            },
            {
              id: 202,
              actionId: "action-rollback",
              createdAt: "2026-07-03T08:03:00.000Z",
              error: "rollback failed",
              intent: "create_schedule_items",
              operation: "rollback",
              status: "indeterminate",
              thread: { id: 302 },
            },
          ],
          totalDocs: 2,
        };
      }

      if (args.collection === "agent-threads") {
        return {
          docs: [
            {
              id: 301,
              createdAt: "2026-07-03T08:04:00.000Z",
              lastInteractionAt: "2026-07-03T08:05:00.000Z",
              messages: [{ content: "user prompt should stay private", role: "user" }],
              pendingAction: {
                action: {
                  args: {},
                  changes: [
                    {
                      collection: "checklists",
                      operation: "create",
                      preview: "Create checklist",
                    },
                  ],
                  id: "pending-action",
                  intent: "create_checklist",
                  riskLevel: "medium",
                  summary: "Create checklist",
                },
                type: "await_confirmation",
              },
              title: "Thread with pending action",
            },
            {
              id: 302,
              createdAt: "2026-07-03T08:06:00.000Z",
              pendingAction: null,
              title: "Thread without pending action",
            },
          ],
          totalDocs: 2,
        };
      }

      return { docs: [], totalDocs: 0 };
    },
    get writeCount() {
      return writeCount;
    },
    update: () => {
      writeCount += 1;
      throw new Error("ops snapshot must not update records");
    },
  };

  return payload;
}

test("Agent ops snapshot returns recent runs receipts pending actions and failures", async () => {
  const payload = createFakePayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  assert.equal(snapshot.recentRuns.length, 2);
  assert.deepEqual(snapshot.recentRuns[0], {
    createdAt: "2026-07-03T08:00:00.000Z",
    durationMs: 1200,
    id: 101,
    intent: "planning",
    model: "gpt-5",
    status: "succeeded",
    totalTokens: 150,
  });
  assert.equal(snapshot.recentReceipts.length, 2);
  assert.equal(snapshot.recentReceipts[0]?.actionId, "action-create-plan");
  assert.equal(snapshot.recentReceipts[0]?.threadId, 301);
  assert.equal(snapshot.pendingActions.length, 1);
  assert.equal(snapshot.pendingActions[0]?.actionId, "pending-action");
  assert.equal(snapshot.pendingActions[0]?.intent, "create_checklist");
  assert.equal(snapshot.failures.length, 2);
  assert.deepEqual(snapshot.receiptReliability, {
    execute: {
      failed: 0,
      indeterminate: 0,
      pending: 0,
      succeeded: 1,
      successRate: 1,
      total: 1,
    },
    rollback: {
      failed: 0,
      indeterminate: 1,
      pending: 0,
      succeeded: 0,
      successRate: 0,
      total: 1,
    },
    sampleSize: 2,
  });
  assert.deepEqual(snapshot.summary, {
    failureCount: 2,
    pendingCount: 1,
    receiptsCount: 2,
    runsCount: 2,
  });
});

test("Agent ops receipt reliability separates execute rollback pending and indeterminate states", async () => {
  const receiptDocs = [
    { id: 1, operation: "execute", status: "succeeded" },
    { id: 2, operation: "execute", status: "failed" },
    { id: 3, operation: "execute", status: "pending" },
    { id: 4, operation: "execute", status: "indeterminate" },
    { id: 5, operation: "rollback", status: "succeeded" },
    { id: 6, operation: "rollback", status: "pending" },
    { id: 7, operation: "rollback", status: "indeterminate" },
  ].map((receipt) => ({
    actionId: `action-${receipt.id}`,
    createdAt: `2026-07-03T08:0${receipt.id}:00.000Z`,
    intent: "create_plan",
    thread: 301,
    ...receipt,
  }));
  const payload: AgentOpsPayloadClient = {
    find: async (args) => ({
      docs: args.collection === "agent-action-receipts" ? receiptDocs : [],
      totalDocs: args.collection === "agent-action-receipts" ? receiptDocs.length : 0,
    }),
  };

  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  assert.equal(snapshot.receiptReliability.sampleSize, 7);
  assert.deepEqual(snapshot.receiptReliability.execute, {
    failed: 1,
    indeterminate: 1,
    pending: 1,
    succeeded: 1,
    successRate: 1 / 3,
    total: 4,
  });
  assert.deepEqual(snapshot.receiptReliability.rollback, {
    failed: 0,
    indeterminate: 1,
    pending: 1,
    succeeded: 1,
    successRate: 1 / 2,
    total: 3,
  });
});

test("Agent ops receipt reliability uses null success rates when no receipt has completed", async () => {
  const payload: AgentOpsPayloadClient = {
    find: async (args) => ({
      docs: args.collection === "agent-action-receipts"
        ? [{ id: 1, operation: "execute", status: "pending" }]
        : [],
      totalDocs: args.collection === "agent-action-receipts" ? 1 : 0,
    }),
  };

  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  assert.equal(snapshot.receiptReliability.sampleSize, 1);
  assert.equal(snapshot.receiptReliability.execute.pending, 1);
  assert.equal(snapshot.receiptReliability.execute.successRate, null);
  assert.equal(snapshot.receiptReliability.rollback.successRate, null);
});

test("Agent ops snapshot is read-only and does not expose sensitive raw fields", async () => {
  const payload = createFakePayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });
  const serialized = JSON.stringify(snapshot);

  assert.equal(payload.writeCount, 0);
  assert.doesNotMatch(serialized, /full prompt/i);
  assert.doesNotMatch(serialized, /user prompt/i);
  assert.doesNotMatch(serialized, /sk-live-secret/);
  assert.doesNotMatch(serialized, /raw success body/);
  assert.doesNotMatch(serialized, /rollbackPayload/);
  assert.doesNotMatch(serialized, /trace/);
});

test("Agent ops snapshot limits returned rows", async () => {
  const payload = createFakePayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 1, payload, userId: 7 });

  assert.equal(snapshot.recentRuns.length, 1);
  assert.equal(snapshot.recentReceipts.length, 1);
  assert.equal(snapshot.pendingActions.length, 1);
  assert.equal(snapshot.summary.runsCount, 1);
  assert.ok(payload.calls.every((call) => call.limit === 1));
});

/* ── M6-B1: Receipt collection / documentId / title extraction ── */

const RICH_RECEIPTS: Record<string, unknown>[] = [
  {
    id: 201,
    actionId: "action-create-checklist",
    createdAt: "2026-07-04T08:02:00.000Z",
    error: null,
    intent: "create_checklist",
    operation: "execute",
    response: {
      affectedDocuments: [
        { collection: "checklists", documentId: 123, operation: "create", title: "秋招准备清单" },
      ],
    },
    status: "succeeded",
    thread: 401,
  },
  {
    id: 202,
    actionId: "action-create-plan",
    createdAt: "2026-07-04T08:05:00.000Z",
    operation: "execute",
    response: {
      affectedDocuments: [
        { collection: "plans", documentId: 55, operation: "create", title: "Q3 上线计划" },
      ],
    },
    status: "succeeded",
    thread: 402,
  },
  {
    id: 203,
    actionId: "action-no-affected",
    createdAt: "2026-07-04T08:10:00.000Z",
    operation: "execute",
    response: { rawMessage: "no affected documents here" },
    status: "succeeded",
    thread: 403,
  },
];

const RICH_THREADS: Record<string, unknown>[] = [
  {
    id: 401,
    createdAt: "2026-07-04T08:04:00.000Z",
    lastInteractionAt: "2026-07-04T08:06:00.000Z",
    pendingAction: {
      action: {
        changes: [{ collection: "checklists", operation: "create", preview: "创建清单「秋招准备」" }],
        id: "pending-checklist",
        intent: "create_checklist",
        riskLevel: "medium",
        summary: "创建秋招准备清单",
      },
      type: "await_confirmation",
    },
    title: "Thread with pending checklist",
  },
  {
    id: 402,
    createdAt: "2026-07-04T08:08:00.000Z",
    pendingAction: {
      action: {
        changes: [{ collection: "schedule-items", operation: "create", preview: "创建 3 条日程" }],
        id: "pending-schedule",
        intent: "create_schedule_items",
        riskLevel: "medium",
        summary: "创建日程安排",
      },
      type: "await_confirmation",
    },
    title: "Thread with pending schedule",
  },
  {
    id: 403,
    createdAt: "2026-07-04T08:12:00.000Z",
    pendingAction: null,
    title: "Thread without pending",
  },
];

function createRichPayload() {
  let writeCount = 0;
  const calls: FindArgs[] = [];

  return {
    calls,
    get writeCount() { return writeCount; },
    create: () => { writeCount += 1; throw new Error("ops snapshot must not create records"); },
    delete: () => { writeCount += 1; throw new Error("ops snapshot must not delete records"); },
    update: () => { writeCount += 1; throw new Error("ops snapshot must not update records"); },
    find: async (args: FindArgs) => {
      calls.push(args);
      if (args.collection === "agent-action-receipts") {
        return { docs: RICH_RECEIPTS, totalDocs: 3 };
      }
      if (args.collection === "agent-threads") {
        return { docs: RICH_THREADS, totalDocs: 3 };
      }
      return { docs: [], totalDocs: 0 };
    },
  };
}

test("Receipt mapper extracts collection documentId and title from affectedDocuments", async () => {
  const payload = createRichPayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  const receipt1 = snapshot.recentReceipts.find((r) => r.actionId === "action-create-checklist");
  assert.ok(receipt1, "receipt with affectedDocuments should exist");
  assert.equal(receipt1.collection, "checklists");
  assert.equal(receipt1.documentId, 123);
  assert.equal(receipt1.title, "秋招准备清单");

  const receipt2 = snapshot.recentReceipts.find((r) => r.actionId === "action-create-plan");
  assert.ok(receipt2, "receipt with plan should exist");
  assert.equal(receipt2.collection, "plans");
  assert.equal(receipt2.documentId, 55);
  assert.equal(receipt2.title, "Q3 上线计划");
});

test("Receipt mapper returns null for collection documentId title when affectedDocuments absent", async () => {
  const payload = createRichPayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  const noAffected = snapshot.recentReceipts.find((r) => r.actionId === "action-no-affected");
  assert.ok(noAffected, "receipt without affectedDocuments should exist");
  assert.equal(noAffected.collection, null);
  assert.equal(noAffected.documentId, null);
  assert.equal(noAffected.title, null);
});

test("Pending mapper extracts collection and preview from changes[0]", async () => {
  const payload = createRichPayload();
  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });

  const pending1 = snapshot.pendingActions.find((p) => p.actionId === "pending-checklist");
  assert.ok(pending1, "pending action with checklist should exist");
  assert.equal(pending1.collection, "checklists");
  assert.equal(pending1.preview, "创建清单「秋招准备」");

  const pending2 = snapshot.pendingActions.find((p) => p.actionId === "pending-schedule");
  assert.ok(pending2, "pending action with schedule should exist");
  assert.equal(pending2.collection, "schedule-items");
  assert.equal(pending2.preview, "创建 3 条日程");
});

test("Receipt title is truncated to 80 characters", async () => {
  const payload = createFakePayload();
  const longTitle = "A".repeat(120);
  // @ts-expect-error — test override narrows the discriminated union return; safe in test context
  payload.find = async (args: FindArgs) => {
    if (args.collection === "agent-action-receipts") {
      return {
        docs: [{
          id: 301,
          actionId: "action-long-title",
          createdAt: "2026-07-04T08:00:00.000Z",
          operation: "execute",
          response: {
            affectedDocuments: [{
              collection: "checklists",
              documentId: 1,
              operation: "create",
              title: longTitle,
            }],
          },
          status: "succeeded",
          thread: 501,
        }],
        totalDocs: 1,
      };
    }
    if (args.collection === "agent-threads") {
      return { docs: [], totalDocs: 0 };
    }
    return (createFakePayload() as unknown as { find: (args: FindArgs) => ReturnType<AgentOpsPayloadClient["find"]> }).find(args);
  };

  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });
  const receipt = snapshot.recentReceipts[0];
  assert.ok(receipt);
  assert.ok(receipt.title!.length <= 80, `title should be truncated, got ${receipt.title!.length} chars`);
});

/* ── M6-B1: No raw payload leakage for new fields ── */

test("Receipt and pending mappers do not expose raw payload or secrets in new fields", async () => {
  const payload = createFakePayload();
  // @ts-expect-error — test override narrows the discriminated union return; safe in test context
  payload.find = async (args: FindArgs) => {
    if (args.collection === "agent-action-receipts") {
      return {
        docs: [{
          id: 401,
          actionId: "action-secret",
          createdAt: "2026-07-04T08:00:00.000Z",
          operation: "execute",
          response: {
            affectedDocuments: [{
              collection: "checklists",
              documentId: 1,
              operation: "create",
              title: "ok",
              adminHref: "/admin/secret",
              publicHref: "/public/secret",
            }],
            apiKey: "sk-live-secret",
            authorization: "Bearer abc",
            rollbackPayload: { internal: true },
            rawPrompt: "do not show",
          },
          rollbackPayload: { internal: "should not appear" },
          status: "succeeded",
          thread: 601,
        }],
        totalDocs: 1,
      };
    }
    if (args.collection === "agent-threads") {
      return {
        docs: [{
          id: 601,
          createdAt: "2026-07-04T08:04:00.000Z",
          lastInteractionAt: "2026-07-04T08:06:00.000Z",
          pendingAction: {
            action: {
              changes: [{
                collection: "checklists",
                operation: "create",
                preview: "ok preview",
              }],
              id: "pending-ok",
              intent: "create_checklist",
              args: { apiKey: "secret-key", token: "secret-token" },
            },
            type: "await_confirmation",
          },
        }],
        totalDocs: 1,
      };
    }
    return { docs: [], totalDocs: 0 };
  };

  const snapshot = await buildAgentOpsSnapshot({ limit: 20, payload, userId: 7 });
  const serialized = JSON.stringify(snapshot);

  assert.doesNotMatch(serialized, /sk-live-secret/);
  assert.doesNotMatch(serialized, /secret-key/);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.doesNotMatch(serialized, /Bearer abc/);
  assert.doesNotMatch(serialized, /rollbackPayload/);
  assert.doesNotMatch(serialized, /rawPrompt/);
  assert.doesNotMatch(serialized, /adminHref/);
  assert.doesNotMatch(serialized, /publicHref/);
  assert.doesNotMatch(serialized, /apiKey/);
  assert.doesNotMatch(serialized, /authorization/);
  assert.doesNotMatch(serialized, /internal/);
});

test("Agent ops route is an authenticated read-only GET endpoint", () => {
  const source = read("src/app/api/agent/ops/route.ts");

  assert.match(source, /export async function GET/);
  assert.match(source, /getPayloadAuthResult/);
  assert.match(source, /buildAgentOpsSnapshot/);
  assert.doesNotMatch(source, /payload\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /rollbackAgentRun|executeAgentIntent|runAgentChatPipeline/);
});
