/**
 * Phase LLM-R4A: Trace-only integration tests.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAgentToolPlannerTraceOnlyEnabled,
  isLLMToolPlannerEnabled,
} from "../../src/lib/agent/tool-planner";
import { validateLLMToolPlan } from "../../src/lib/agent/tool-planner";

const saveEnv = (key: string) => ({
  had: Object.hasOwn(process.env, key),
  value: process.env[key],
});
const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) process.env[key] = prev.value;
  else delete process.env[key];
};

/* ──── Feature flag tests ──── */

test("isAgentToolPlannerTraceOnlyEnabled returns false by default", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY");
  delete process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY;
  try {
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY", prev);
  }
});

test("isAgentToolPlannerTraceOnlyEnabled returns true when set to 1", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY");
  process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY = "1";
  try {
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY", prev);
  }
});

test("trace-only flag is independent from base planner flag", () => {
  const prevTrace = saveEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY");
  const prevPlanner = saveEnv("AGENT_LLM_TOOL_PLANNER");
  process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY = "1";
  delete process.env.AGENT_LLM_TOOL_PLANNER;
  try {
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), true);
    assert.equal(isLLMToolPlannerEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY", prevTrace);
    restoreEnv("AGENT_LLM_TOOL_PLANNER", prevPlanner);
  }
});

/* ──── Validator still works (unchanged from R3) ──── */

test("validator still rejects execute mode", () => {
  const result = validateLLMToolPlan({
    goal: "test",
    intent: "create_plan",
    confidence: 0.9,
    steps: [
      { id: "s1", toolName: "create_plan", mode: "execute", reason: "x", input: {}, riskLevel: "high" },
    ],
  });
  assert.equal(result.ok, false);
});

test("validator still rejects unknown tools", () => {
  const result = validateLLMToolPlan({
    goal: "test",
    intent: "test",
    confidence: 0.9,
    steps: [
      { id: "s1", toolName: "unknown_tool", mode: "read", reason: "x", input: {}, riskLevel: "low" },
    ],
  });
  assert.equal(result.ok, false);
});

test("validator still accepts legal plan", () => {
  const result = validateLLMToolPlan({
    goal: "查看计划",
    intent: "query_plan_progress",
    confidence: 0.9,
    steps: [
      { id: "s1", toolName: "query_plan_progress", mode: "read", reason: "查看", input: {}, riskLevel: "low" },
    ],
  });
  assert.equal(result.ok, true);
});

/* ──── Shadow planner does not affect validator ──── */

test("shadow planner validation uses same rules as R3", () => {
  // Write tool with mode=read must still fail
  const result = validateLLMToolPlan({
    goal: "test",
    intent: "create_plan",
    confidence: 0.9,
    steps: [
      { id: "s1", toolName: "create_plan", mode: "read", reason: "x", input: {}, riskLevel: "low" },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("dry_run"));
});
