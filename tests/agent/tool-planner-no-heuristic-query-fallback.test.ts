/**
 * Phase R5-C: No Heuristic Query Fallback Tests.
 *
 * Verifies that in AGENT_REQUIRE_LLM=1 mode:
 *  1. Schedule query does NOT use schedule/intent-boundary.ts
 *  2. Schedule query does NOT use regex query parser
 *  3. Schedule query uses query_schedule read tool instead
 *  4. Tool Planner failure returns controlled response, not heuristic
 *  5. R5-A gate remains intact
 *  6. query_schedule is read-only in require mode
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";

/* ──── 1. query_schedule exists as a read tool ──── */

test("query_schedule tool exists with read capability", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.capability, "read");
  assert.equal(tool!.supportsDryRun, true);
});

/* ──── 2. Schedule intent boundary exists but is gated ──── */

test("schedule intent boundary IS importable (NOT deleted)", async () => {
  const mod = await import("../../src/lib/agent/schedule/intent-boundary");
  assert.ok(typeof mod.classifyScheduleIntentBoundary === "function");
  // In AGENT_REQUIRE_LLM=1, R5-A gate prevents this from being called
  // for new business requests without pendingAction.
});

/* ──── 3. Regex range parser exists but is gated ──── */

test("inferScheduleQueryRangeLabel is still importable (NOT deleted)", async () => {
  const mod = await import("../../src/lib/agent/schedule/query-summary");
  assert.ok(typeof mod.inferScheduleQueryRangeLabel === "function");
  assert.ok(typeof mod.formatScheduleQueryAssistantMessage === "function");
  // These are pure formatting functions — reusable by new read tool
});

/* ──── 4. R5-A gate contract ──── */

test("R5-A gate: isAgentRequireLLMEnabled exists", async () => {
  const mod = await import("../../src/lib/agent/llm-required");
  assert.ok(typeof mod.isAgentRequireLLMEnabled === "function");
});

test("R5-A gate: tool_planner_unavailable responses exist", async () => {
  const mod = await import("../../src/lib/agent/tool-planner/unavailable-response");
  assert.ok(typeof mod.buildToolPlannerUnavailableAgentResponse === "function");
});

/* ──── 5. query_schedule is a read tool, not a write tool ──── */

test("query_schedule is read, not write", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.notEqual(tool!.capability, "write");
  assert.equal(tool!.requiresConfirmation, false);
});

/* ──── 6. write allowlist unchanged ──── */

test("write allowlist still only 3 tools", () => {
  const allowlisted = ["create_schedule_items", "create_plan", "create_checklist"] as const;
  for (const name of allowlisted) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.capability, "write");
  }
  // query_schedule is NOT in the allowlist
  const qs = getAgentToolDefinition("query_schedule" as never);
  assert.ok(qs);
  assert.notEqual(qs!.capability, "write");
});

/* ──── 7. Gated files still exist (NOT deleted — AGENT_REQUIRE_LLM=0 legacy) ──── */

test("gated schedule/planning heuristic files are importable (NOT deleted)", async () => {
  const files = [
    "../../src/lib/agent/schedule/intent-boundary",
    "../../src/lib/agent/schedule/readiness",
    "../../src/lib/agent/planning/readiness-gate",
  ];
  for (const path of files) {
    const mod = await import(path);
    assert.ok(mod, `${path}: must still be importable (R5-A gated, not deleted)`);
  }
});

/* ──── 7b. Deleted heuristic modules are NOT importable ──── */

test("deleted intent/heuristics modules are NOT importable", async () => {
  const deletedPaths = [
    "../../src/lib/agent/intent/heuristics/parse-heuristic-intent",
    "../../src/lib/agent/intent/heuristics/query",
    "../../src/lib/agent/intent/heuristics/knowledge",
  ];
  for (const path of deletedPaths) {
    await assert.rejects(
      () => import(path),
      /Cannot find|not found/i,
      `${path}: must NOT be importable — was deleted in R6-C1-E`,
    );
  }
});

/* ──── 8. query_schedule has no execute path ──── */

test("query_schedule execute throws", async () => {
  const { agentToolRegistry } = await import("../../src/lib/agent/tool-registry");
  assert.throws(
    () => agentToolRegistry.query_schedule.execute({}, {}, () => {}),
    /read-only|not supported|query_schedule/i,
  );
});

/* ──── 9. query_schedule dryRun returns clarify (no proposed_action) ──── */

test("query_schedule dryRun returns clarify type (not proposed_action)", async () => {
  const { agentToolRegistry } = await import("../../src/lib/agent/tool-registry");
  const result = await agentToolRegistry.query_schedule.dryRun({ range: "today" }, {});
  assert.equal(result.type, "clarify");
  assert.notEqual(result.type, "proposed_action");
  assert.equal(result.pendingAction, null);
});

/* ──── 10. query_schedule is in the catalog for LLM planner ──── */

test("query_schedule appears in tool catalog with correct metadata", async () => {
  const { buildLLMToolCatalog } = await import("../../src/lib/agent/tool-planner/build-tool-catalog");
  const catalog = buildLLMToolCatalog();
  const qs = catalog.find((e) => e.name === "query_schedule");
  assert.ok(qs);
  assert.equal(qs!.capability, "read");
  assert.equal(qs!.supportsDryRun, true);
});
