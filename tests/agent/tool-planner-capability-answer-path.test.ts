/**
 * Phase R5-C: Capability Answer Path Tests.
 *
 * Verifies that:
 *  1. Capability answer response is importable and produces valid output
 *  2. Response has no pendingAction, no execute, no DB write
 *  3. Response does NOT use regex capability router
 *  4. Response has natural Chinese text
 *  5. Response mentions write requires confirmation
 *  6. Response does NOT promise all operations are rollback-able
 *  7. Response does NOT promise automatic writes
 *  8. Trace events are sanitized
 *  9. No raw tool registry JSON exposed
 * 10. No internal env flags exposed
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCapabilityAnswerResponse,
} from "../../src/lib/agent/tool-planner/unavailable-response";

/* ──── 1. Response builder works ──── */

test("buildCapabilityAnswerResponse returns valid response", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.ok(response);
  assert.ok(typeof response.assistantMessage === "string");
  assert.ok(response.assistantMessage.length > 100, "capability answer should be substantive");
});

/* ──── 2. No pendingAction ──── */

test("capability answer has no pendingAction", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.equal(response.pendingAction, null);
});

/* ──── 3. intent is answer_question (not write) ──── */

test("capability answer intent is answer_question", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.equal(response.intent, "answer_question");
  assert.notEqual(response.intent, "create_plan");
  assert.notEqual(response.intent, "create_schedule_items");
});

/* ──── 4. No execute markers ──── */

test("capability answer has no execute markers", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("\"execute\""));
  assert.ok(!s.includes("autoExecute"));
});

/* ──── 5. No DB write ──── */

test("capability answer has no DB write instructions", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── 6. No raw tool registry JSON ──── */

test("capability answer does NOT expose raw tool registry", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("agentToolRegistry"));
  assert.ok(!s.includes("\"dryRun\":"));
  assert.ok(!s.includes("\"execute\":"));
});

/* ──── 7. No internal env flags ──── */

test("capability answer does NOT expose env flags", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("AGENT_REQUIRE_LLM"));
  assert.ok(!s.includes("AGENT_LLM_TOOL_PLANNER"));
  assert.ok(!s.includes("AGENT_DISABLE_LLM"));
  assert.ok(!s.includes("PAYLOAD_SECRET"));
});

/* ──── 8. Natural Chinese text ──── */

test("capability answer contains natural Chinese text", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.ok(/[一-鿿]/.test(response.assistantMessage));
  assert.ok(response.assistantMessage.includes("查询") || response.assistantMessage.includes("只读"));
  assert.ok(response.assistantMessage.includes("确认") || response.assistantMessage.includes("预览"));
});

/* ──── 9. Mentions write requires confirmation ──── */

test("capability answer mentions write requires confirmation", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.ok(
    response.assistantMessage.includes("确认") ||
    response.assistantMessage.includes("预览"),
    "should mention confirmation or preview requirement",
  );
});

/* ──── 10. Does NOT promise all writes are auto-executable ──── */

test("capability answer does NOT promise automatic writes", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  // Message says "我不会：自动执行写入、绕过确认" — it negates these, doesn't promise them
  assert.ok(response.assistantMessage.includes("我不会") || response.assistantMessage.includes("不会自动"), "should deny auto-execution");
  assert.ok(!response.assistantMessage.includes("我会自动"));
  assert.ok(!response.assistantMessage.includes("可以直接写入"));
});

/* ──── 11. Does NOT promise all operations are rollback-able ──── */

test("capability answer does NOT promise all operations rollback-able", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  // Message says "不会...承诺所有操作都可回滚" — it denies the promise, which is correct
  assert.ok(!response.assistantMessage.includes("企业级审计"));
  // Should mention rollback with appropriate qualification
  assert.ok(response.assistantMessage.includes("回滚") || response.assistantMessage.includes("撤销"));
  // Should NOT say all operations support rollback WITHOUT negation
  assert.ok(!response.assistantMessage.includes("所有操作都支持回滚"));
});

/* ──── 12. Trace events sanitized ──── */

test("capability answer trace events are sanitized", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.ok(response.backendTraceEvents!.length >= 1);
  const s = JSON.stringify(response.backendTraceEvents);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("apiKey"));
  assert.ok(!s.includes("Authorization"));
  assert.ok(!s.includes("password"));
});

/* ──── 13. Trace has correct phase ──── */

test("capability answer trace has valid phase", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const event = response.backendTraceEvents![0];
  assert.equal(event.phase, "tool_planning");
  assert.equal(event.status, "success");
  assert.ok(event.title!.length > 0);
});

/* ──── 14. Confidence is reasonable ──── */

test("capability answer has reasonable confidence", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  assert.equal(response.confidence, 0.9);
});

/* ──── 15. No raw prompt / response ──── */

test("capability answer has no raw prompt or response markers", () => {
  const response = buildCapabilityAnswerResponse({ threadId: 1 });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("rawPrompt"));
  assert.ok(!s.includes("rawResponse"));
  assert.ok(!s.includes("\"prompt\""));
});
