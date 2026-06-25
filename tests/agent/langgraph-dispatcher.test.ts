import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRuntimeRunner } from "../../src/lib/agent/langgraph/dispatcher";

test("LangGraph is the default runtime and never falls back on failure", async () => {
  let legacyCalls = 0;
  let legacyConstructed = 0;
  const runner = createAgentRuntimeRunner({
    config: { mode: "langgraph" },
    createLangGraphRunner: () => async () => {
        throw new Error("graph failed");
    },
    createLegacyRunner: () => {
      legacyConstructed += 1;
      return async () => {
        legacyCalls += 1;
        return "legacy";
      };
    },
  });

  await assert.rejects(runner(), /graph failed/);
  assert.equal(legacyCalls, 0);
  assert.equal(legacyConstructed, 0);
});

test("legacy runs only when explicitly configured", async () => {
  const calls: string[] = [];
  let graphConstructed = 0;
  const runner = createAgentRuntimeRunner({
    config: { mode: "legacy" },
    createLangGraphRunner: () => {
      graphConstructed += 1;
      return async () => {
        calls.push("langgraph");
        return "langgraph";
      };
    },
    createLegacyRunner: () => async () => {
      calls.push("legacy");
      return "legacy";
    },
  });

  assert.equal(await runner(), "legacy");
  assert.deepEqual(calls, ["legacy"]);
  assert.equal(graphConstructed, 0);
});
