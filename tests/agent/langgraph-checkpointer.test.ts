import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSunnyAgentCheckpointConfig,
  createSunnyAgentPostgresSaver,
} from "../../src/lib/agent/langgraph/checkpointer";
import {
  buildSunnyAgentCheckpointThreadId,
  deleteAgentThreadWithCheckpoint,
  parseSunnyAgentCheckpointThreadId,
  resolveCheckpointRetentionDays,
  selectCheckpointCleanupCandidates,
} from "../../src/lib/agent/langgraph/checkpoint-lifecycle";

test("checkpoint config isolates graph state by user and AgentThread", () => {
  assert.deepEqual(
    buildSunnyAgentCheckpointConfig({ threadId: 42, userId: 7 }),
    {
      configurable: {
        thread_id: "sunny-agent:v1:7:42",
      },
      durability: "sync",
    },
  );
});

test("checkpoint factory requires a database URL without running setup", () => {
  assert.throws(
    () => createSunnyAgentPostgresSaver(""),
    /DATABASE_URL/,
  );

  const saver = createSunnyAgentPostgresSaver(
    "postgresql://user:password@localhost:5432/sunnypanel",
  );

  assert.equal(typeof saver.setup, "function");
});

test("checkpoint lifecycle parses only owned versioned namespaces", () => {
  assert.equal(
    buildSunnyAgentCheckpointThreadId({ threadId: 42, userId: 7 }),
    "sunny-agent:v1:7:42",
  );
  assert.deepEqual(
    parseSunnyAgentCheckpointThreadId("sunny-agent:v1:7:42"),
    {
      compatible: true,
      threadId: 42,
      userId: 7,
      version: "v1",
    },
  );
  assert.equal(
    parseSunnyAgentCheckpointThreadId("sunny-agent:v2:7:42")?.compatible,
    false,
  );
  for (const invalid of [
    "other:v1:7:42",
    "sunny-agent:v1:0:42",
    "sunny-agent:v1:7:-1",
    "sunny-agent:v1:7:42:extra",
  ]) {
    assert.equal(parseSunnyAgentCheckpointThreadId(invalid), null);
  }
});

test("checkpoint retention is explicit and bounded", () => {
  assert.equal(resolveCheckpointRetentionDays(undefined), 30);
  assert.equal(resolveCheckpointRetentionDays("90"), 90);
  assert.throws(() => resolveCheckpointRetentionDays("0"), /integer/);
  assert.throws(() => resolveCheckpointRetentionDays("3.5"), /integer/);
  assert.throws(() => resolveCheckpointRetentionDays("3651"), /integer/);
});

test("checkpoint cleanup preserves active threads and selects only orphaned or eligible expired rows", () => {
  const cutoff = new Date("2026-07-21T00:00:00.000Z");
  const candidates = selectCheckpointCleanupCandidates({
    activeThreadKeys: new Set(["7:42", "7:43", "7:44"]),
    cutoff,
    records: [
      {
        // Old activity alone never expires an active, unarchived conversation.
        lastSeenAt: new Date("2026-06-01T00:00:00.000Z"),
        threadId: "sunny-agent:v1:7:42",
      },
      {
        lastSeenAt: new Date("2026-06-01T00:00:00.000Z"),
        threadId: "sunny-agent:v1:7:43",
      },
      {
        lastSeenAt: new Date("2026-06-01T00:00:00.000Z"),
        threadId: "sunny-agent:v0:7:44",
      },
      {
        lastSeenAt: null,
        threadId: "sunny-agent:v1:9:99",
      },
      {
        lastSeenAt: new Date("2020-01-01T00:00:00.000Z"),
        threadId: "foreign:v1:7:45",
      },
    ],
    retentionEligibleThreadKeys: new Set(["7:43", "7:44"]),
  });

  assert.deepEqual(candidates, [
    { reason: "expired", threadId: "sunny-agent:v1:7:43" },
    { reason: "incompatible_expired", threadId: "sunny-agent:v0:7:44" },
    { reason: "orphaned", threadId: "sunny-agent:v1:9:99" },
  ]);
});

test("thread deletion removes checkpoint first and refuses business deletion on checkpoint failure", async () => {
  const events: string[] = [];

  await deleteAgentThreadWithCheckpoint({
    checkpointer: {
      deleteThread: async (threadId) => {
        events.push(`checkpoint:${threadId}`);
      },
    },
    deleteBusinessThread: async () => {
      events.push("business");
    },
    threadId: 42,
    userId: 7,
  });
  assert.deepEqual(events, ["checkpoint:sunny-agent:v1:7:42", "business"]);

  let businessDeletes = 0;
  await assert.rejects(
    deleteAgentThreadWithCheckpoint({
      checkpointer: {
        deleteThread: async () => {
          throw new Error("database internals must not escape the route");
        },
      },
      deleteBusinessThread: async () => {
        businessDeletes += 1;
      },
      threadId: 42,
      userId: 7,
    }),
  );
  assert.equal(businessDeletes, 0);
});
