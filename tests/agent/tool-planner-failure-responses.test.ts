/**
 * Phase R5-A: Tool Planner Failure Response Tests.
 *
 * Verifies that:
 *  1. buildToolPlannerUnavailableAgentResponse produces correct shapes
 *  2. No pendingAction, dryRun, execute, DB write in responses
 *  3. Natural user-facing messages (no internal enums)
 *  4. Backend trace events are sanitized
 *  5. All 6 reason types produce valid responses
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
  type BuildToolPlannerUnavailableResponseInput,
} from "../../src/lib/agent/tool-planner/unavailable-response";

/* ──── Helpers ──── */

const ALL_REASONS: AgentToolPlannerUnavailableReason[] = [
  "tool_planner_disabled",
  "tool_planner_invalid_plan",
  "tool_planner_unsupported_tool",
  "tool_planner_low_confidence",
  "tool_planner_missing_information",
  "tool_planner_failed",
];

const buildResponse = (reason: AgentToolPlannerUnavailableReason, overrides?: Partial<BuildToolPlannerUnavailableResponseInput>) =>
  buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1, ...overrides });

/* ──── 1. Response shape for all reason types ──── */

for (const reason of ALL_REASONS) {
  test(`buildToolPlannerUnavailableAgentResponse: ${reason} → valid shape`, () => {
    const response = buildResponse(reason);

    // Core fields
    assert.ok(typeof response.assistantMessage === "string");
    assert.ok(response.assistantMessage.length > 20, `message too short for ${reason}`);
    assert.equal(response.confidence, 0.5);
    assert.equal(response.engine, "workflow");
    assert.equal(response.intent, "clarify");

    // No pendingAction (critical safety invariant)
    assert.equal(response.pendingAction, null);

    // Backend trace events
    assert.ok(Array.isArray(response.backendTraceEvents));
    assert.ok(response.backendTraceEvents!.length >= 1);
  });
}

/* ──── 2. No pendingAction ──── */

test("response has no pendingAction (all types)", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    assert.equal(response.pendingAction, null, `${reason}: must have null pendingAction`);
  }
});

/* ──── 3. No dryRun / execute / write markers ──── */

test("response JSON has no dryRun or execute markers", () => {
  for (const reason of ALL_REASONS) {
    const s = JSON.stringify(buildResponse(reason));
    assert.ok(!s.includes("dryRun"), `${reason}: must not contain dryRun`);
    assert.ok(!s.includes("\"execute\""), `${reason}: must not contain execute`);
    assert.ok(!s.includes("executeAgentIntent"), `${reason}: must not contain executeAgentIntent`);
    assert.ok(!s.includes("autoExecute"), `${reason}: must not contain autoExecute`);
  }
});

/* ──── 4. No DB write instruction ──── */

test("response JSON has no DB write instruction", () => {
  for (const reason of ALL_REASONS) {
    const s = JSON.stringify(buildResponse(reason));
    assert.ok(!s.includes("payload.create"));
    assert.ok(!s.includes("payload.update"));
    assert.ok(!s.includes("payload.delete"));
  }
});

/* ──── 5. No secrets ──── */

test("response JSON has no secrets", () => {
  for (const reason of ALL_REASONS) {
    const s = JSON.stringify(buildResponse(reason));
    assert.ok(!s.includes("sk-"));
    assert.ok(!s.includes("Bearer"));
    assert.ok(!s.includes("api_key"));
    assert.ok(!s.includes("apiKey"));
    assert.ok(!s.includes("Authorization"));
    assert.ok(!s.includes("password"));
  }
});

/* ──── 6. No raw prompt / raw response ──── */

test("response JSON has no raw prompt", () => {
  for (const reason of ALL_REASONS) {
    const s = JSON.stringify(buildResponse(reason));
    assert.ok(!s.includes("rawPrompt"));
    assert.ok(!s.includes("rawResponse"));
    assert.ok(!s.includes("raw_response"));
    assert.ok(!s.includes("\"prompt\""));
  }
});

/* ──── 7. Natural user messages (no internal enums) ──── */

test("user-facing messages are natural — no internal enums", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    const msg = response.assistantMessage;
    // Must not expose internal enum values
    assert.ok(!msg.includes("tool_planner_disabled"), `${reason}: must not expose enum`);
    assert.ok(!msg.includes("tool_planner_invalid_plan"), `${reason}: must not expose enum`);
    assert.ok(!msg.includes("AGENT_LLM"), `${reason}: must not expose env var name`);
    assert.ok(!msg.includes("AGENT_REQUIRE_LLM"), `${reason}: must not expose env var name`);
  }
});

/* ──── 8. Messages are in Chinese (natural for target users) ──── */

test("user-facing messages contain readable text", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    const msg = response.assistantMessage;
    // Should be readable Chinese text (not empty, not just ASCII)
    assert.ok(/[一-鿿]/.test(msg), `${reason}: message should contain Chinese`);
  }
});

/* ──── 9. Tool Planner disabled message is specific ──── */

test("tool_planner_disabled: message mentions config check", () => {
  const response = buildResponse("tool_planner_disabled");
  assert.ok(
    response.assistantMessage.includes("配置") || response.assistantMessage.includes("不可用"),
    "disabled message should mention configuration",
  );
});

/* ──── 10. Tool Planner missing info message is helpful ──── */

test("tool_planner_missing_information: message is helpful", () => {
  const response = buildResponse("tool_planner_missing_information");
  assert.ok(
    response.assistantMessage.includes("信息") || response.assistantMessage.includes("确认"),
    "missing info message should be helpful",
  );
});

/* ──── 11. Tool Planner invalid plan message ──── */

test("tool_planner_invalid_plan: message suggests retry", () => {
  const response = buildResponse("tool_planner_invalid_plan");
  assert.ok(
    response.assistantMessage.includes("具体") || response.assistantMessage.includes("需求"),
    "invalid plan message should suggest trying differently",
  );
});

/* ──── 12. Backend trace event has correct phase ──── */

test("backendTraceEvents use tool_planner_unavailable phase", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    assert.ok(response.backendTraceEvents!.length >= 1);
    const traceEvent = response.backendTraceEvents![0];
    assert.equal(traceEvent.phase, "tool_planner_unavailable");
    assert.equal(traceEvent.status, "failed");
    // Developer trace contains the reason
    const preview = traceEvent.outputPreview as Record<string, unknown> | undefined;
    assert.ok(preview, `${reason}: trace must have outputPreview`);
    assert.equal(preview!.reason, reason);
  }
});

/* ──── 13. Trace events are sanitized (no raw secrets) ──── */

test("trace events have no secrets", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    for (const event of response.backendTraceEvents!) {
      const s = JSON.stringify(event);
      assert.ok(!s.includes("sk-"));
      assert.ok(!s.includes("Bearer"));
      assert.ok(!s.includes("api_key"));
      assert.ok(!s.includes("apiKey"));
      assert.ok(!s.includes("Authorization"));
      assert.ok(!s.includes("password"));
    }
  }
});

/* ──── 14. detail field is passed through to trace ──── */

test("detail is included in trace outputPreview", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_failed",
    detail: "LLM returned invalid JSON at position 42",
    threadId: 1,
  });
  const preview = response.backendTraceEvents![0].outputPreview as Record<string, unknown>;
  assert.equal(preview.detail, "LLM returned invalid JSON at position 42");
  assert.equal(preview.source, "tool_planner");
});

/* ──── 15. threadId is preserved ──── */

test("threadId is preserved in response", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 42,
  });
  assert.equal(response.threadId, 42);
});

test("string threadId is converted to number", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: "99",
  });
  assert.equal(response.threadId, 99);
});

/* ──── 16. tokenUsage is zero (no LLM call was made) ──── */

test("tokenUsage reflects no LLM call", () => {
  for (const reason of ALL_REASONS) {
    const response = buildResponse(reason);
    assert.equal(response.tokenUsage!.contextTokens, 0);
    assert.equal(response.tokenUsage!.inputTokens, 0);
    assert.equal(response.tokenUsage!.outputTokens, 0);
  }
});

/* ──── 17. Type exports are importable ──── */

test("AgentToolPlannerUnavailableReason covers all 6 codes", () => {
  assert.equal(ALL_REASONS.length, 6);
  // Verify uniqueness
  assert.equal(new Set(ALL_REASONS).size, 6);
});
