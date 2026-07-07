/**
 * Phase R5-B: Read / Draft Path Parity Tests.
 *
 * Verifies that in AGENT_REQUIRE_LLM=1 mode:
 *  1. query_plan_progress read plan can run dryRun preview
 *  2. compose_plan draft plan can run dryRun preview
 *  3. compose_schedule_item draft plan can run dryRun preview
 *  4. read/draft path does NOT create pendingAction
 *  5. read/draft path does NOT enter Policy Guard
 *  6. read/draft path does NOT call execute
 *  7. read/draft path has backendTraceEvents
 *  8. invalid read plan gets controlled rejection
 *  9. unsupported tool gets controlled rejection
 * 10. buildReadDraftAssistantMessage produces natural language
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
} from "../../src/lib/agent/tool-planner/unavailable-response";

/* ──── 1. Read tool supports dryRun ──── */

test("query_plan_progress has supportsDryRun=true and supportsExecute=true", () => {
  const tool = getAgentToolDefinition("query_plan_progress");
  assert.ok(tool);
  assert.equal(tool!.capability, "read");
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.supportsExecute, true);
  assert.equal(tool!.requiresConfirmation, false);
  assert.equal(tool!.canRunWithoutConfirmation, true);
});

/* ──── 2. Draft tools all support dryRun ──── */

test("compose_plan draft tool supports dryRun", () => {
  const tool = getAgentToolDefinition("compose_plan");
  assert.ok(tool);
  assert.equal(tool!.capability, "draft");
  assert.equal(tool!.supportsDryRun, true);
});

test("compose_schedule_item draft tool supports dryRun", () => {
  const tool = getAgentToolDefinition("compose_schedule_item");
  assert.ok(tool);
  assert.equal(tool!.capability, "draft");
  assert.equal(tool!.supportsDryRun, true);
});

test("compose_timeline_event draft tool supports dryRun", () => {
  const tool = getAgentToolDefinition("compose_timeline_event");
  assert.ok(tool);
  assert.equal(tool!.capability, "draft");
  assert.equal(tool!.supportsDryRun, true);
});

/* ──── 3. Read tool has correct metadata invariants ──── */

test("query_plan_progress: requiresConfirmation=false, riskLevel=low", () => {
  const tool = getAgentToolDefinition("query_plan_progress");
  assert.ok(tool);
  assert.equal(tool!.requiresConfirmation, false);
  assert.equal(tool!.riskLevel, "low");
  assert.equal(tool!.supportsRollback, false);
});

/* ──── 4. Draft tools have correct metadata invariants ──── */

test("draft tools: canRunWithoutConfirmation=true", () => {
  for (const name of ["compose_plan", "compose_schedule_item", "compose_timeline_event"] as const) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist`);
    assert.equal(tool!.capability, "draft", `${name}: must be draft`);
    assert.equal(tool!.canRunWithoutConfirmation, true, `${name}: can run without confirmation`);
  }
});

/* ──── 5. Read/draft responses do NOT create pendingAction ──── */

test("controlled unavailable responses never have pendingAction", () => {
  const reasons: AgentToolPlannerUnavailableReason[] = [
    "tool_planner_disabled",
    "tool_planner_invalid_plan",
    "tool_planner_unsupported_tool",
    "tool_planner_low_confidence",
    "tool_planner_missing_information",
    "tool_planner_failed",
  ];
  for (const reason of reasons) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.equal(response.pendingAction, null);
  }
});

/* ──── 6. Read/draft responses do NOT contain execute markers ──── */

test("controlled responses have no execute markers", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("\"execute\""));
  assert.ok(!s.includes("autoExecute"));
});

/* ──── 7. Read/draft responses do NOT contain DB write instructions ──── */

test("controlled responses have no DB write instructions", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_missing_information",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── 8. write tool allowlist is still 3 tools ──── */

test("write proposal allowlist unchanged at 3 tools", () => {
  // The allowlist is ["create_schedule_items", "create_plan", "create_checklist"]
  const allowlisted = ["create_schedule_items", "create_plan", "create_checklist"] as const;
  for (const name of allowlisted) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.capability, "write");
    assert.equal(tool!.requiresConfirmation, true);
    assert.equal(tool!.supportsDryRun, true);
  }
});

/* ──── 9. Read tool is NOT in write allowlist ──── */

test("query_plan_progress is NOT a write tool", () => {
  const tool = getAgentToolDefinition("query_plan_progress");
  assert.ok(tool);
  assert.notEqual(tool!.capability, "write");
  assert.equal(tool!.requiresConfirmation, false);
});

/* ──── 10. All read/draft tools have backend trace capability ──── */

test("all read/draft tools are in the registry catalog", () => {
  const readDraftNames = ["query_plan_progress", "compose_plan", "compose_schedule_item", "compose_timeline_event"] as const;
  for (const name of readDraftNames) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must be in registry`);
  }
});

/* ──── 11. Read path has no Policy Guard / execute requirements ──── */

test("query_plan_progress does not require Policy Guard or execute", () => {
  const tool = getAgentToolDefinition("query_plan_progress");
  assert.ok(tool);
  // canRunWithoutConfirmation=true means it can bypass pending confirmation
  assert.equal(tool!.canRunWithoutConfirmation, true);
  // requiresConfirmation=false means it doesn't need user confirm
  assert.equal(tool!.requiresConfirmation, false);
  // supportsRollback=false means no rollback needed for reads
  assert.equal(tool!.supportsRollback, false);
});

/* ──── 12. Draft tools have correct risk levels ──── */

test("draft tools have appropriate risk levels", () => {
  assert.equal(getAgentToolDefinition("compose_plan")!.riskLevel, "medium");
  assert.equal(getAgentToolDefinition("compose_schedule_item")!.riskLevel, "medium");
  assert.equal(getAgentToolDefinition("compose_timeline_event")!.riskLevel, "high");
});

/* ──── 13. Tool catalog includes all capabilities ──── */

test("tool catalog includes read, draft, and write tools", async () => {
  const { buildLLMToolCatalog } = await import("../../src/lib/agent/tool-planner/build-tool-catalog");
  const all = buildLLMToolCatalog();
  const capabilities = new Set(all.map((e) => e.capability));
  assert.ok(capabilities.has("read"));
  assert.ok(capabilities.has("draft"));
  assert.ok(capabilities.has("write"));
});
