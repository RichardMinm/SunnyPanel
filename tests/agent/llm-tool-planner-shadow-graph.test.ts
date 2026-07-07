/**
 * Phase LLM-R4A: Shadow graph unit tests.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runToolPlannerShadowGraph } from "../../src/lib/agent/tool-planner/shadow-graph";
import { isAgentToolPlannerTraceOnlyEnabled } from "../../src/lib/agent/tool-planner";

const saveEnv = (key: string) => ({
  had: Object.hasOwn(process.env, key),
  value: process.env[key],
});
const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) process.env[key] = prev.value;
  else delete process.env[key];
};

/* ──── Shadow runner tests ──── */

test("shadow runner completes without throwing", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "帮我查看计划进度",
  });
  assert.ok(result.status);
  assert.ok(Array.isArray(result.traceEvents));
  assert.ok(Array.isArray(result.warnings));
});

test("shadow runner records trace events", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "帮我查看计划进度",
  });
  assert.ok(result.traceEvents.length > 0, "Should have at least 1 trace event");
  for (const event of result.traceEvents) {
    assert.equal(event.phase, "tool_planning");
    assert.ok(event.title);
    assert.ok(event.summary);
  }
});

test("shadow runner trace does NOT contain secrets", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "test",
  });
  const serialized = JSON.stringify(result.traceEvents);
  assert.ok(!serialized.includes("sk-"), "No API key prefix");
  assert.ok(!serialized.includes("Bearer"), "No auth header");
  assert.ok(!serialized.includes("api_key"), "No api_key field");
});

test("shadow runner does not create pendingAction", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "test",
  });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("pendingAction"));
});

test("shadow runner does not execute any tool", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "test",
  });
  // Shadow runner returns trace + status, not tool results
  assert.ok("status" in result);
  assert.ok("traceEvents" in result);
  // No execute results, no dry-run results
  assert.ok(!("dryRunResult" in result));
  assert.ok(!("executeResult" in result));
});

test("shadow runner status is one of valid states", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "test",
  });
  const valid = ["idle", "catalog_built", "planned", "validated", "invalid", "failed", "skipped"];
  assert.ok(valid.includes(result.status), `Invalid status: ${result.status}`);
});

test("shadow runner trace mode is trace_only", async () => {
  const result = await runToolPlannerShadowGraph({
    userMessage: "test",
  });
  for (const event of result.traceEvents) {
    if (event.outputPreview && typeof event.outputPreview === "object") {
      const op = event.outputPreview as Record<string, unknown>;
      if (op.mode) {
        assert.equal(op.mode, "trace_only");
      }
    }
  }
});
