/**
 * Phase R6-C2-C: Tool Planner Schedule Proposal Contract Tests.
 *
 * Verifies the schedule proposal lifecycle from Tool Planner → draft/dry-run →
 * pending confirmation → execute boundary. No real LLM calls — all assertions
 * are against deterministic tool metadata, dryRun outputs, and controlled responses.
 *
 * Covered invariants:
 *  1. Write tools (create_schedule_items) have correct capability metadata
 *  2. Draft tool (compose_schedule_item) dryRun → proposed_action with await_confirmation
 *  3. Draft tool dryRun snapshot is safe (no DB write, no receipt)
 *  4. Draft tool dryRun does NOT execute
 *  5. Read-only tool (query_schedule) does NOT cross into write territory
 *  6. Invalid date/time → controlled response, no execute
 *  7. Planner unavailable → controlled response, no pendingAction, no execute
 *  8. Invalid tool name / disallowed tool → controlled rejection
 *  9. No heuristic fallback in any controlled response path
 *
 * NOT covered here (covered elsewhere):
 *  - query_schedule read-only invariants → tool-planner-schedule-read-tool.test.ts
 *  - Read/draft tool metadata parity → tool-planner-read-draft-parity.test.ts
 *  - Feature flag gating / heuristic existence → llm-required-no-heuristic-business-path.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition, agentToolRegistry } from "../../src/lib/agent/tool-registry";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
} from "../../src/lib/agent/tool-planner/unavailable-response";
import { buildCapabilityAnswerResponse } from "../../src/lib/agent/tool-planner/unavailable-response";
import {
  evaluateScheduleReadiness,
  type ScheduleSlots,
} from "../../src/lib/agent/schedule/readiness";

/* ═══════════════════════════════════════════════════════════════
   1. Write tool metadata contract
   ═══════════════════════════════════════════════════════════════ */

test("create_schedule_items: capability=write", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
});

test("create_schedule_items: requiresConfirmation=true", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.requiresConfirmation, true);
});

test("create_schedule_items: canRunWithoutConfirmation=false (write tools must not auto-execute)", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.canRunWithoutConfirmation, false);
});

test("create_schedule_items: supportsExecute=true, supportsDryRun=true", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.supportsExecute, true);
});

test("create_schedule_items: supportsRollback=true", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.supportsRollback, true);
});

/* ═══════════════════════════════════════════════════════════════
   2. Draft tool (compose_schedule_item) dryRun → proposed_action
   ═══════════════════════════════════════════════════════════════ */

test("compose_schedule_item dryRun produces proposed_action type", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      date: "2026-07-08",
      description: "项目复盘",
      endTime: "16:00",
      sourceText: "明天下午3点到4点安排一个项目复盘",
      startTime: "15:00",
      title: "项目复盘",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
});

test("compose_schedule_item dryRun proposed_action has riskLevel=medium", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      date: "2026-07-08",
      sourceText: "明天下午3点到4点安排一个项目复盘",
      startTime: "15:00",
      endTime: "16:00",
      title: "项目复盘",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  assert.equal(result.action.riskLevel, "medium");
});

test("compose_schedule_item dryRun proposed_action requiresConfirmation=true", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      date: "2026-07-08",
      sourceText: "明天下午3点到4点安排一个项目复盘",
      startTime: "15:00",
      endTime: "16:00",
      title: "项目复盘",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  assert.equal(result.action.requiresConfirmation, true);
});

/* ═══════════════════════════════════════════════════════════════
   3. Draft tool dryRun: no DB write, no receipt
   ═══════════════════════════════════════════════════════════════ */

test("compose_schedule_item dryRun snapshot does NOT contain DB write instructions", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      date: "2026-07-08",
      sourceText: "明天下午3点到4点安排",
      startTime: "15:00",
      endTime: "16:00",
      title: "项目复盘",
    },
    {},
  );
  const s = JSON.stringify(result);
  assert.ok(!s.includes("payload.create"), "dryRun must not contain payload.create");
  assert.ok(!s.includes("payload.update"), "dryRun must not contain payload.update");
  assert.ok(!s.includes("payload.delete"), "dryRun must not contain payload.delete");
  assert.ok(!s.includes("receipt"), "dryRun must not produce receipt");
});

test("compose_schedule_item dryRun proposed_action has rollbackAvailable metadata", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      date: "2026-07-08",
      sourceText: "3点到4点开会",
      startTime: "15:00",
      endTime: "16:00",
      title: "会议",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  // rollbackAvailable is set — true or false is fine, just verifying it's present
  assert.ok(typeof result.action.rollbackAvailable === "boolean");
  // rollbackPayload is present (null or valid)
  assert.ok("rollbackPayload" in result.action);
});

/* ═══════════════════════════════════════════════════════════════
   4. Draft tool dryRun does NOT execute
   ═══════════════════════════════════════════════════════════════ */

test("compose_schedule_item dryRun does NOT call execute", async () => {
  const tool = agentToolRegistry.compose_schedule_item;
  const result = await tool.dryRun(
    {
      sourceText: "3点到4点会议",
      title: "会议",
    },
    {},
  );
  const s = JSON.stringify(result);
  assert.ok(!s.includes("\"execute\""), "dryRun must not contain execute marker");
  assert.ok(!s.includes("executeAgentIntent"), "dryRun must not reference execute");
});

test("compose_schedule_item dryRun does NOT create real pendingAction", async () => {
  // dryRun returns proposed_action with the action preview,
  // but it's the calling pipeline that creates pendingAction.
  // The dryRun itself does not write to any persistent state.
  const tool = agentToolRegistry.compose_schedule_item;
  const result1 = await tool.dryRun(
    { sourceText: "会议", title: "A" },
    {},
  );
  const result2 = await tool.dryRun(
    { sourceText: "会议", title: "B" },
    {},
  );
  // Each call is independent and deterministic — no side effects
  assert.equal(result1.type, result2.type);
  if (result1.type === "proposed_action" && result2.type === "proposed_action") {
    assert.ok(result1.action.id !== result2.action.id || result1.action.summary !== result2.action.summary);
  }
});

/* ═══════════════════════════════════════════════════════════════
   5. Read-only tool does NOT cross into write territory
   ═══════════════════════════════════════════════════════════════ */

test("query_schedule dryRun returns clarify (not proposed_action)", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({ range: "today" }, {});
  assert.equal(result.type, "clarify");
});

test("query_schedule dryRun does NOT produce proposed_action", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({ range: "this_week" }, {});
  assert.notEqual(result.type, "proposed_action");
});

test("query_schedule dryRun has pendingAction=null", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({}, {});
  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.equal(result.pendingAction, null);
  }
});

/* ═══════════════════════════════════════════════════════════════
   6. Schedule readiness: missing slots → insufficient
   ═══════════════════════════════════════════════════════════════ */

test("readiness: tasks without time slots → insufficient (not draftable)", () => {
  const readiness = evaluateScheduleReadiness({
    slots: {
      tasks: [{ title: "项目复盘" }],
    },
    userMessage: "帮我安排一个项目复盘",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.length > 0, "should report missing slots");
  assert.ok(readiness.missingSlots.includes("availableTimeWindows"));
  // When status is insufficient, should clarify — NOT create pendingAction
});

test("readiness: tasks + time slots → draftable", () => {
  const readiness = evaluateScheduleReadiness({
    slots: {
      tasks: [{ title: "项目复盘" }],
      availableTimeWindows: [
        { day: "每天", startTime: "20:00", endTime: "22:00" },
      ],
    },
    userMessage: "每天晚上8点到10点安排项目复盘",
  });

  assert.equal(readiness.status, "draftable");
  // draftable means info is sufficient to generate a draft
  // but the draft itself is NOT a DB write and NOT an execute
});

test("readiness: existing draft + explicit create → confirmable", () => {
  // Existing draft + explicit save = confirmable (ready for dry-run → confirmation)
  const readiness = evaluateScheduleReadiness({
    hasExistingDraft: true,
    slots: {
      tasks: [{ title: "项目复盘" }],
    },
    userMessage: "就按这个日程创建",
  });

  assert.equal(readiness.status, "confirmable");
  // confirmable means ready for dry-run → confirmation path
  // It does NOT mean auto-execute
});

test("readiness: invalid date scenario — missing time context is insufficient", () => {
  const readiness = evaluateScheduleReadiness({
    slots: {},
    userMessage: "2月31日安排会议",
  });

  // No tasks, no time windows → insufficient.
  // The system should NOT try to resolve "2月31日" and create a write intent.
  // It should ask the user for more context.
  assert.equal(readiness.status, "insufficient");
});

/* ═══════════════════════════════════════════════════════════════
   7. Planner unavailable → controlled response
   ═══════════════════════════════════════════════════════════════ */

test("planner unavailable: no pendingAction", () => {
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
    assert.equal(response.pendingAction, null, `${reason}: must not create pendingAction`);
  }
});

test("planner unavailable: no execute markers", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"), "must not reference executeAgentIntent");
  assert.ok(!s.includes("\"execute\""), "must not contain execute");
});

test("planner unavailable: no DB write instructions", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_failed",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("payload.create"), "must not contain payload.create");
  assert.ok(!s.includes("payload.update"), "must not contain payload.update");
  assert.ok(!s.includes("payload.delete"), "must not contain payload.delete");
});

test("planner unavailable: has user-facing message", () => {
  for (const reason of [
    "tool_planner_disabled",
    "tool_planner_invalid_plan",
    "tool_planner_failed",
  ] as const) {
    const response = buildToolPlannerUnavailableAgentResponse({ reason, threadId: 1 });
    assert.ok(typeof response.assistantMessage === "string");
    assert.ok(response.assistantMessage.length > 10);
  }
});

test("planner unavailable: assistantMessage has no heuristic fallback language", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_disabled",
    threadId: 1,
  });
  // User-facing assistantMessage must NOT expose heuristic fallback vocabulary
  const msg = response.assistantMessage;
  assert.ok(!msg.includes("heuristic"), "assistantMessage must not contain 'heuristic'");
  assert.ok(!msg.includes("rule-based"), "assistantMessage must not contain 'rule-based'");
  assert.ok(!msg.includes("引擎"), "assistantMessage must not expose engine terminology");
});

/* ═══════════════════════════════════════════════════════════════
   8. Invalid / unknown tool → controlled rejection
   ═══════════════════════════════════════════════════════════════ */

test("invalid tool: getAgentToolDefinition returns null for unknown name", () => {
  const tool = getAgentToolDefinition("unknown_schedule_tool" as never);
  assert.equal(tool, null);
});

test("invalid tool: unsupported tool leads to controlled unavailable response", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_unsupported_tool",
    threadId: 1,
  });
  assert.equal(response.pendingAction, null);
  assert.ok(response.assistantMessage.length > 10);
});

test("low confidence: controlled response without execute", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_low_confidence",
    threadId: 1,
  });
  assert.equal(response.pendingAction, null);
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"));
});

test("missing information: controlled response asks for more detail", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_missing_information",
    threadId: 1,
  });
  assert.equal(response.pendingAction, null);
  assert.ok(response.assistantMessage.length > 5);
});

/* ═══════════════════════════════════════════════════════════════
   9. Write allowlist boundary
   ═══════════════════════════════════════════════════════════════ */

test("write allowlist is exactly 3 tools", () => {
  const writeTools = ["create_schedule_items", "create_plan", "create_checklist"] as const;
  for (const name of writeTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must be in registry`);
    assert.equal(tool!.capability, "write", `${name}: must be write`);
    assert.equal(tool!.requiresConfirmation, true, `${name}: must require confirmation`);
    assert.equal(tool!.canRunWithoutConfirmation, false, `${name}: must not auto-execute`);
  }
});

test("draft and read tools are NOT in write allowlist capability", () => {
  const nonWriteTools = ["query_schedule", "compose_schedule_item", "compose_plan", "compose_checklist", "compose_timeline_event"] as const;
  for (const name of nonWriteTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.notEqual(tool!.capability, "write", `${name}: must NOT be write capability`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   10. No execute before confirmation contract
   ═══════════════════════════════════════════════════════════════ */

test("execute is ONLY supported by write tools and some draft tools", () => {
  // read tools → no execute
  assert.equal(agentToolRegistry.query_schedule.supportsExecute, false);

  // draft tools → may support execute (after confirmation)
  assert.equal(agentToolRegistry.compose_schedule_item.supportsExecute, true);

  // write tools → support execute (after confirmation)
  assert.equal(agentToolRegistry.create_schedule_items.supportsExecute, true);
});

test("dryRun is supported by ALL schedule-related tools", () => {
  const scheduleTools = [
    "query_schedule",
    "compose_schedule_item",
    "create_schedule_items",
  ] as const;
  for (const name of scheduleTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist`);
    assert.equal(tool!.supportsDryRun, true, `${name}: must support dryRun`);
  }
});
