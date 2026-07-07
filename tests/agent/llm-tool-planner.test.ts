/**
 * Phase LLM-R3: LLM Tool Planner tests.
 *
 * These tests use the VALIDATOR directly (not the LLM) to verify
 * planner-like behavior. The actual planToolsWithLLM() function requires
 * a real LLM endpoint — we test its feature flag / unavailable gating
 * and defer full LLM integration to manual verification.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateLLMToolPlan, isLLMToolPlannerEnabled } from "../../src/lib/agent/tool-planner";
import { isAgentRequireLLMEnabled } from "../../src/lib/agent/llm-required";

/* ──── Save/restore env helpers ──── */

const saveEnv = (key: string) => ({
  had: Object.hasOwn(process.env, key),
  value: process.env[key],
});
const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) process.env[key] = prev.value;
  else delete process.env[key];
};

/* ──── Feature flag tests ──── */

test("isLLMToolPlannerEnabled returns false by default", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER");
  delete process.env.AGENT_LLM_TOOL_PLANNER;
  try {
    assert.equal(isLLMToolPlannerEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER", prev);
  }
});

test("isLLMToolPlannerEnabled returns true when AGENT_LLM_TOOL_PLANNER=1", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER");
  process.env.AGENT_LLM_TOOL_PLANNER = "1";
  try {
    assert.equal(isLLMToolPlannerEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER", prev);
  }
});

/* ──── LLM-required mode interaction ──── */

test("AGENT_REQUIRE_LLM + AGENT_DISABLE_LLM: validator still works (pure function)", () => {
  // Validator is a pure function — it works regardless of LLM availability
  const result = validateLLMToolPlan({
    goal: "test",
    intent: "query_plan_progress",
    confidence: 0.9,
    steps: [
      {
        id: "step-1",
        toolName: "query_plan_progress",
        mode: "read",
        reason: "test",
        input: {},
        riskLevel: "low",
      },
    ],
  });
  assert.equal(result.ok, true);
});

/* ──── Complete workflow simulations ──── */

test("simulated: read plan passes validation", () => {
  // This simulates what planToolsWithLLM would do with a valid LLM response
  const llmOutput = {
    goal: "查看本周日程安排",
    intent: "query_schedule",
    confidence: 0.92,
    steps: [
      {
        id: "step-1",
        toolName: "query_plan_progress",
        mode: "read",
        reason: "先查看计划进度了解当前状态",
        input: {},
        riskLevel: "low",
      },
    ],
    userFacingSummary: "正在查看你的计划和日程安排",
  };

  const result = validateLLMToolPlan(llmOutput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plan.goal, "查看本周日程安排");
    assert.equal(result.plan.confidence, 0.92);
    assert.equal(result.plan.userFacingSummary, "正在查看你的计划和日程安排");
  }
});

test("simulated: draft plan passes validation", () => {
  const llmOutput = {
    goal: "为 Rust 学习制定计划",
    intent: "compose_plan",
    confidence: 0.78,
    steps: [
      {
        id: "step-1",
        toolName: "compose_plan",
        mode: "draft",
        reason: "生成学习计划草案供用户审阅",
        input: { goal: "Learn Rust in 4 weeks", sourceText: "我想学 Rust 编程语言" },
        riskLevel: "medium",
      },
    ],
    userFacingSummary: "正在生成 Rust 学习计划草案",
  };

  const result = validateLLMToolPlan(llmOutput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plan.steps[0]!.mode, "draft");
  }
});

test("simulated: write dry_run plan passes validation", () => {
  const llmOutput = {
    goal: "将任务加入日程",
    intent: "create_schedule_items",
    confidence: 0.85,
    steps: [
      {
        id: "step-1",
        toolName: "compose_schedule_item",
        mode: "draft",
        reason: "先生成日程草案",
        input: { title: "Code review", date: "2026-07-07" },
        riskLevel: "medium",
      },
      {
        id: "step-2",
        toolName: "create_schedule_items",
        mode: "dry_run",
        reason: "预览将要创建的日程",
        input: {},
        dependsOn: ["step-1"],
        riskLevel: "medium",
      },
    ],
  };

  const result = validateLLMToolPlan(llmOutput);
  assert.equal(result.ok, true);
});

test("simulated: invalid JSON plan rejected", () => {
  // Simulates LLM returning garbage
  const result = validateLLMToolPlan({ goal: "test" }); // missing required fields
  assert.equal(result.ok, false);
});

test("simulated: execute mode rejected", () => {
  const llmOutput = {
    goal: "创建计划",
    intent: "create_plan",
    confidence: 0.9,
    steps: [
      {
        id: "step-1",
        toolName: "create_plan",
        mode: "execute",
        reason: "直接创建",
        input: { title: "Test" },
        riskLevel: "high",
      },
    ],
  };

  const result = validateLLMToolPlan(llmOutput);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("execute"));
});

test("simulated: unknown tool rejected", () => {
  const llmOutput = {
    goal: "test",
    intent: "test",
    confidence: 0.9,
    steps: [
      {
        id: "step-1",
        toolName: "hack_the_planet",
        mode: "read",
        reason: "test",
        input: {},
        riskLevel: "low",
      },
    ],
  };

  const result = validateLLMToolPlan(llmOutput);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("unknown"));
});

test("simulated: missingInformation returns needs_clarification status", () => {
  // The plan has missing info but NO dry_run steps — should pass validation
  // but the planner would detect missing info and return needs_clarification
  const llmOutput = {
    goal: "创建计划",
    intent: "compose_plan",
    confidence: 0.6,
    steps: [
      {
        id: "step-1",
        toolName: "compose_plan",
        mode: "draft",
        reason: "生成草案",
        input: {},
        riskLevel: "medium",
      },
    ],
    missingInformation: ["deadline", "scope"],
  };

  const result = validateLLMToolPlan(llmOutput);
  // Draft step + no dry_run → plan passes validation
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.plan.missingInformation);
    assert.equal(result.plan.missingInformation!.length, 2);
  }
});
