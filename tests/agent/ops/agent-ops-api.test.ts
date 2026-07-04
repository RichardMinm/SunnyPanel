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
  assert.deepEqual(snapshot.summary, {
    failureCount: 2,
    pendingCount: 1,
    receiptsCount: 2,
    runsCount: 2,
  });
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

test("Agent ops route is an authenticated read-only GET endpoint", () => {
  const source = read("src/app/api/agent/ops/route.ts");

  assert.match(source, /export async function GET/);
  assert.match(source, /getPayloadAuthResult/);
  assert.match(source, /buildAgentOpsSnapshot/);
  assert.doesNotMatch(source, /payload\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /rollbackAgentRun|executeAgentIntent|runAgentChatPipeline/);
});
