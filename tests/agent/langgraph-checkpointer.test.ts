import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSunnyAgentCheckpointConfig,
  createSunnyAgentPostgresSaver,
} from "../../src/lib/agent/langgraph/checkpointer";

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
