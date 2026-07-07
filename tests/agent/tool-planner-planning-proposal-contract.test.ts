/**
 * Phase R6-C2-C: Tool Planner Planning Proposal Contract Tests.
 *
 * Verifies the planning proposal lifecycle from Tool Planner → readiness →
 * draft → confirmation → execute boundary. No real LLM calls — all assertions
 * are against deterministic tool metadata, dryRun outputs, and controlled responses.
 *
 * Covered invariants:
 *  1. Write tools (create_plan, create_checklist) have correct capability metadata
 *  2. Draft tool (compose_plan) dryRun → proposed_action with requiresConfirmation
 *  3. Draft tool dryRun snapshot is safe (no DB write, no receipt)
 *  4. Readiness: missing plan fields → insufficient → clarification, no execute
 *  5. Readiness: complete plan → draftable or confirmable
 *  6. compose_checklist draft tool is draft-only (no execute)
 *  7. Planner unavailable → controlled response, no pendingAction, no execute
 *  8. Invalid / unknown tool → controlled rejection
 *  9. No heuristic fallback in any controlled path
 *
 * NOT covered here (covered elsewhere):
 *  - Read/draft tool metadata parity → tool-planner-read-draft-parity.test.ts
 *  - Feature flag gating / heuristic existence → llm-required-no-heuristic-business-path.test.ts
 *  - Full workflow E2E → planning-full-workflow-e2e.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition, agentToolRegistry } from "../../src/lib/agent/tool-registry";
import {
  buildToolPlannerUnavailableAgentResponse,
  type AgentToolPlannerUnavailableReason,
} from "../../src/lib/agent/tool-planner/unavailable-response";
import {
  evaluatePlanReadiness,
  mergePlanSlots,
  type PlanSlots,
} from "../../src/lib/agent/planning/readiness";

/* ═══════════════════════════════════════════════════════════════
   1. Write tool metadata contract
   ═══════════════════════════════════════════════════════════════ */

test("create_plan: capability=write", () => {
  const tool = getAgentToolDefinition("create_plan");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
});

test("create_plan: requiresConfirmation=true, canRunWithoutConfirmation=false", () => {
  const tool = getAgentToolDefinition("create_plan");
  assert.ok(tool);
  assert.equal(tool!.requiresConfirmation, true);
  assert.equal(tool!.canRunWithoutConfirmation, false);
});

test("create_plan: supportsExecute=true, supportsDryRun=true, supportsRollback=true", () => {
  const tool = getAgentToolDefinition("create_plan");
  assert.ok(tool);
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.supportsExecute, true);
  assert.equal(tool!.supportsRollback, true);
});

test("create_checklist: capability=write, requiresConfirmation=true", () => {
  const tool = getAgentToolDefinition("create_checklist");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
  assert.equal(tool!.requiresConfirmation, true);
  assert.equal(tool!.canRunWithoutConfirmation, false);
});

/* ═══════════════════════════════════════════════════════════════
   2. Draft tool (compose_plan) dryRun → proposed_action
   ═══════════════════════════════════════════════════════════════ */

test("compose_plan dryRun produces proposed_action type", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "SunnyPanel 第一版上线",
      sourceText: "帮我制定下周的毕业设计推进计划",
        scope: "登录、Agent 对话、计划管理",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
});

test("compose_plan dryRun proposed_action requiresConfirmation=true", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "毕业设计推进",
      sourceText: "帮我制定下周的毕业设计推进计划",
      },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  assert.equal(result.action.requiresConfirmation, true);
});

test("compose_plan dryRun proposed_action has riskLevel", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "毕业设计推进",
      sourceText: "帮我制定下周的毕业设计推进计划",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  assert.equal(result.action.riskLevel, "medium");
});

/* ═══════════════════════════════════════════════════════════════
   3. Draft tool dryRun: no DB write, no receipt, no execute
   ═══════════════════════════════════════════════════════════════ */

test("compose_plan dryRun snapshot does NOT contain DB write instructions", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "毕业设计推进",
      sourceText: "帮我制定下周的毕业设计推进计划",
      },
    {},
  );
  const s = JSON.stringify(result);
  assert.ok(!s.includes("payload.create"), "dryRun must not contain payload.create");
  assert.ok(!s.includes("payload.update"), "dryRun must not contain payload.update");
  assert.ok(!s.includes("payload.delete"), "dryRun must not contain payload.delete");
  assert.ok(!s.includes("receipt"), "dryRun must not produce receipt");
});

test("compose_plan dryRun does NOT contain execute markers", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "毕业设计推进",
      sourceText: "帮我制定下周的毕业设计推进计划",
    },
    {},
  );
  const s = JSON.stringify(result);
  assert.ok(!s.includes("\"execute\""), "dryRun must not contain execute");
  assert.ok(!s.includes("executeAgentIntent"), "dryRun must not reference executeAgentIntent");
});

test("compose_plan dryRun proposed_action has rollback metadata", async () => {
  const tool = agentToolRegistry.compose_plan;
  const result = await tool.dryRun(
    {
      goal: "毕业设计推进",
      sourceText: "帮我制定下周的毕业设计推进计划",
    },
    {},
  );
  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;
  assert.ok(typeof result.action.rollbackAvailable === "boolean");
});

/* ═══════════════════════════════════════════════════════════════
   4. compose_checklist: draft-only tool (no execute)
   ═══════════════════════════════════════════════════════════════ */

test("compose_checklist: capability=draft, supportsExecute=false", () => {
  const tool = getAgentToolDefinition("compose_checklist");
  assert.ok(tool);
  assert.equal(tool!.capability, "draft");
  assert.equal(tool!.supportsExecute, false);
  assert.equal(tool!.supportsDryRun, true);
});

test("compose_checklist: does NOT require confirmation", () => {
  const tool = getAgentToolDefinition("compose_checklist");
  assert.ok(tool);
  assert.equal(tool!.requiresConfirmation, false);
  assert.equal(tool!.canRunWithoutConfirmation, true);
});

test("compose_checklist execute throws error (draft-only)", () => {
  const tool = agentToolRegistry.compose_checklist;
  assert.throws(
    () => tool.execute({}, {}, () => {}),
    /draft|not supported|compose_checklist/i,
  );
});

/* ═══════════════════════════════════════════════════════════════
   5. Plan readiness: missing fields → insufficient
   ═══════════════════════════════════════════════════════════════ */

test("readiness: goal + deadline only → insufficient for large plan", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      goal: "SunnyPanel 第一版上线",
      deadline: "2026-06-30",
    },
    userMessage: "帮我计划，6月30日之前 SunnyPanel 第一版需要上线",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("scope"), "should ask for scope");
  assert.ok(readiness.missingSlots.includes("currentProgress"), "should ask for progress");
  assert.ok(readiness.missingSlots.includes("availableTime"), "should ask for available time");
});

test("readiness: bare request with no context → insufficient", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我做个计划",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.length > 2, "bare requests need many fields");
});

test("readiness: insufficient → no status that implies write-ready", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我做个计划",
  });

  // When insufficient, status must NOT be confirmable
  assert.notEqual(readiness.status, "confirmable");
  // System should clarify, not create pendingAction for write
});

test("readiness: complete plan → draftable", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      availableTime: "每天 3 小时",
      currentProgress: "后端接口完成了一半",
      deadline: "2026-06-30",
      deliverables: ["登录注册", "Agent 对话"],
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话和部署",
      successCriteria: "公网可访问并可完成核心流程",
    },
    userMessage: "帮我规划 SunnyPanel 第一版上线",
  });

  assert.equal(readiness.status, "draftable");
  assert.deepEqual(readiness.missingSlots, []);
});

test("readiness: complete plan + explicit create intent → confirmable", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      availableTime: "每天 3 小时",
      currentProgress: "后端接口完成了一半",
      deadline: "2026-06-30",
      deliverables: ["登录注册", "Agent 对话"],
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话和部署",
      successCriteria: "公网可访问并可完成核心流程",
    },
    userMessage: "请把这些内容保存为计划",
  });

  assert.equal(readiness.status, "confirmable");
  // confirmable means ready for dry-run → confirmation → (maybe) execute
  // It does NOT auto-execute or auto-write
});

test("readiness: small explicit task → confirmable", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
  });

  assert.equal(readiness.status, "confirmable");
});

/* ═══════════════════════════════════════════════════════════════
   6. mergePlanSlots: safe merge
   ═══════════════════════════════════════════════════════════════ */

test("mergePlanSlots does not mutate inputs", () => {
  const sessionSlots: PlanSlots = { goal: "SunnyPanel 上线" };
  const extractedSlots: PlanSlots = { scope: "第一版" };
  const sessionBefore = structuredClone(sessionSlots);
  const extractedBefore = structuredClone(extractedSlots);

  const merged = mergePlanSlots(sessionSlots, extractedSlots);

  assert.deepEqual(sessionSlots, sessionBefore);
  assert.deepEqual(extractedSlots, extractedBefore);
  assert.notEqual(merged, sessionSlots);
});

test("mergePlanSlots does not replace useful values with empty", () => {
  const merged = mergePlanSlots(
    { goal: "SunnyPanel 上线", availableTime: "每天 2 小时" },
    { goal: "", availableTime: "   " },
  );

  assert.equal(merged.goal, "SunnyPanel 上线");
  assert.equal(merged.availableTime, "每天 2 小时");
});

/* ═══════════════════════════════════════════════════════════════
   7. Planner unavailable → controlled response
   ═══════════════════════════════════════════════════════════════ */

test("planner unavailable: no pendingAction for any reason", () => {
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
    assert.equal(response.pendingAction, null, `${reason}: pendingAction must be null`);
  }
});

test("planner unavailable: no execute markers", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_failed",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("executeAgentIntent"));
  assert.ok(!s.includes("\"execute\""));
});

test("planner unavailable: no DB write instructions", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_missing_information",
    threadId: 1,
  });
  const s = JSON.stringify(response);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

test("planner unavailable: assistantMessage has no heuristic fallback language", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_invalid_plan",
    threadId: 1,
  });
  const msg = response.assistantMessage;
  assert.ok(!msg.includes("heuristic"), "assistantMessage must not contain 'heuristic'");
  assert.ok(!msg.includes("rule-based"), "assistantMessage must not contain 'rule-based'");
  assert.ok(!msg.includes("引擎"), "assistantMessage must not expose engine terminology");
});

test("planner unavailable: has user-facing message", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_missing_information",
    threadId: 1,
  });
  assert.ok(typeof response.assistantMessage === "string");
  assert.ok(response.assistantMessage.length > 10);
});

/* ═══════════════════════════════════════════════════════════════
   8. Invalid tool → controlled rejection
   ═══════════════════════════════════════════════════════════════ */

test("getAgentToolDefinition returns null for unknown planning tool", () => {
  const tool = getAgentToolDefinition("unknown_planning_tool" as never);
  assert.equal(tool, null);
});

test("invalid plan: controlled unavailable response, no execute", () => {
  const response = buildToolPlannerUnavailableAgentResponse({
    reason: "tool_planner_invalid_plan",
    threadId: 1,
  });
  assert.equal(response.pendingAction, null);
  const s = JSON.stringify(response);
  assert.ok(!s.includes("\"execute\""));
});

/* ═══════════════════════════════════════════════════════════════
   9. No execute before confirmation contract
   ═══════════════════════════════════════════════════════════════ */

test("planning write tools require confirmation before execute", () => {
  const writeTools = ["create_plan", "create_checklist"] as const;
  for (const name of writeTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.requiresConfirmation, true, `${name}: must require confirmation`);
    assert.equal(tool!.canRunWithoutConfirmation, false, `${name}: must not auto-execute`);
  }
});

test("compose_plan capability=draft (not write) — separate from create_plan", () => {
  const compose = getAgentToolDefinition("compose_plan");
  const create = getAgentToolDefinition("create_plan");
  assert.ok(compose && create);
  assert.equal(compose!.capability, "draft");
  assert.equal(create!.capability, "write");
  // draft tool CAN run without confirmation (it produces a draft, not a DB write)
  assert.equal(compose!.canRunWithoutConfirmation, true);
  // write tool CANNOT run without confirmation
  assert.equal(create!.canRunWithoutConfirmation, false);
});

test("all planning-related tools support dryRun", () => {
  const planningTools = [
    "query_plan_progress",
    "compose_plan",
    "compose_checklist",
    "create_plan",
    "create_checklist",
  ] as const;
  for (const name of planningTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist in registry`);
    assert.equal(tool!.supportsDryRun, true, `${name}: must support dryRun`);
  }
});

test("readiness: evaluatePlanReadiness stays deterministic", () => {
  const slots = {
    availableTime: "每天 3 小时",
    currentProgress: "后端完成一半",
    deadline: "2026-06-30",
    deliverables: ["登录"],
    goal: "第一版上线",
    scope: "登录和部署",
    successCriteria: "公网可用",
  };
  const first = evaluatePlanReadiness({
    slots,
    userMessage: "请保存为计划",
  });
  const second = evaluatePlanReadiness({
    slots,
    userMessage: "请保存为计划",
  });

  assert.deepEqual(second.status, first.status);
  assert.deepEqual(second.missingSlots, first.missingSlots);
});
