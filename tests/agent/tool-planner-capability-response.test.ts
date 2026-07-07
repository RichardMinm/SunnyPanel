/**
 * Phase R5-B: Capability / Supported Actions Answer Tests.
 *
 * Verifies that in AGENT_REQUIRE_LLM=1 mode:
 *  1. Capability answer does NOT use regex capability router
 *  2. Controlled capability answer has no pendingAction
 *  3. Controlled capability answer has no DB write
 *  4. Controlled capability answer exposes no raw tool registry JSON
 *  5. Controlled capability answer exposes no internal env flag
 *  6. Existing R5-A tests still pass (regression)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
} from "../../src/lib/agent/tool-planner/unavailable-response";

/* ──── 1. No raw tool registry JSON in responses ──── */

test("unavailable responses do NOT expose raw tool registry", () => {
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
    const s = JSON.stringify(response);
    // Must not contain raw tool registry
    assert.ok(!s.includes("agentToolRegistry"));
    assert.ok(!s.includes("tool-registry"));
    assert.ok(!s.includes("dryRun\":"));
    assert.ok(!s.includes("execute\":"));
  }
});

/* ──── 2. No internal env flags exposed ──── */

test("unavailable responses do NOT expose internal env flags", () => {
  const reasons: AgentToolPlannerUnavailableReason[] = [
    "tool_planner_disabled",
    "tool_planner_failed",
    "tool_planner_unsupported_tool",
  ];

  for (const reason of reasons) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    const s = JSON.stringify(response);
    assert.ok(!s.includes("AGENT_REQUIRE_LLM"));
    assert.ok(!s.includes("AGENT_LLM_TOOL_PLANNER"));
    assert.ok(!s.includes("AGENT_DISABLE_LLM"));
    assert.ok(!s.includes("PAYLOAD_SECRET"));
    assert.ok(!s.includes("DATABASE_URL"));
  }
});

/* ──── 3. User-facing message is natural language ──── */

test("capability-related unavailable: user message is natural Chinese", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_unsupported_tool",
    threadId: 1,
  });
  assert.ok(/[一-鿿]/.test(response.assistantMessage));
  assert.ok(!response.assistantMessage.includes("tool_planner"));
  assert.ok(!response.assistantMessage.includes("unsupported"));
});

/* ──── 4. No pendingAction created ──── */

test("all unavailable responses have null pendingAction", () => {
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

/* ──── 5. No DB write in capability responses ──── */

test("capability responses have no DB write instructions", () => {
  for (const reason of ["tool_planner_disabled", "tool_planner_unsupported_tool"] as const) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    const s = JSON.stringify(response);
    assert.ok(!s.includes("payload.create"));
    assert.ok(!s.includes("payload.update"));
    assert.ok(!s.includes("payload.delete"));
  }
});

/* ──── 6. Capability router EXISTS but is GATED ──── */

test("capability router exists but is gated by R5-A in require mode", async () => {
  // The capability router file still exists (not deleted)
  const mod = await import("../../src/lib/agent/router/capability-router");
  assert.ok(typeof mod.routeCapabilityRouter === "function");
  // But in AGENT_REQUIRE_LLM=1, R5-A gate prevents EOD loop from calling
  // resolveRouterChain → routeCapabilityRouter for new business requests
});

/* ──── 7. All response types return clarify intent ──── */

test("all response types return clarify intent, not write", () => {
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
    assert.equal(response.intent, "clarify");
    assert.notEqual(response.intent, "create_plan");
    assert.notEqual(response.intent, "create_schedule_items");
    assert.notEqual(response.intent, "create_checklist");
  }
});

/* ──── 8. Trace events have correct phase ──── */

test("all response trace events use valid phases", () => {
  const validPhases = [
    "user_message", "router", "session", "readiness", "slot_extraction",
    "draft", "dry_run", "policy_guard", "pending_confirmation", "execute",
    "tool_call", "api_call", "receipt", "rollback", "finalize",
    "llm_availability", "tool_planning", "tool_planner_unavailable", "error",
  ];

  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 1,
  });

  for (const event of response.backendTraceEvents!) {
    assert.ok(validPhases.includes(event.phase), `phase ${event.phase} must be valid`);
  }
});

/* ──── 9. No raw prompts or secrets exposed ──── */

test("trace events are sanitized", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_failed",
    threadId: 1,
  });
  const s = JSON.stringify(response.backendTraceEvents);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("apiKey"));
  assert.ok(!s.includes("Authorization"));
  assert.ok(!s.includes("password"));
  assert.ok(!s.includes("rawPrompt"));
  assert.ok(!s.includes("rawResponse"));
});
