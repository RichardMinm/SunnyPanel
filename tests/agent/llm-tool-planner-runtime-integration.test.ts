/**
 * Phase LLM-R4B: Integration tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAgentToolPlannerGraphRuntimeEnabled,
  isAgentToolPlannerTraceOnlyEnabled,
} from "../../src/lib/agent/tool-planner";
import { validateLLMToolPlan } from "../../src/lib/agent/tool-planner";

const saveEnv = (key: string) => ({ had: Object.hasOwn(process.env, key), value: process.env[key] });
const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) process.env[key] = prev.value; else delete process.env[key];
};

test("graph runtime flag is independent from trace-only flag", () => {
  const prevGr = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");
  const prevTr = saveEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY");
  process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME = "1";
  delete process.env.AGENT_LLM_TOOL_PLANNER_TRACE_ONLY;
  try {
    assert.equal(isAgentToolPlannerGraphRuntimeEnabled(), true);
    assert.equal(isAgentToolPlannerTraceOnlyEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prevGr);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_TRACE_ONLY", prevTr);
  }
});

test("validator unchanged: read plan passes", () => {
  const result = validateLLMToolPlan({
    goal: "查看计划", intent: "query_plan_progress", confidence: 0.9,
    steps: [{ id: "s1", toolName: "query_plan_progress", mode: "read", reason: "x", input: {}, riskLevel: "low" }],
  });
  assert.equal(result.ok, true);
});

test("validator unchanged: multi-step plan with read+draft passes", () => {
  const result = validateLLMToolPlan({
    goal: "制定计划", intent: "compose_plan", confidence: 0.85,
    steps: [
      { id: "s1", toolName: "query_plan_progress", mode: "read", reason: "查看", input: {}, riskLevel: "low" },
      { id: "s2", toolName: "compose_plan", mode: "draft", reason: "生成草案", input: { goal: "test" }, dependsOn: ["s1"], riskLevel: "medium" },
    ],
  });
  assert.equal(result.ok, true);
});

test("validator unchanged: write tool dry_run + read passes", () => {
  const result = validateLLMToolPlan({
    goal: "预览创建计划", intent: "create_plan", confidence: 0.9,
    steps: [
      { id: "s1", toolName: "query_plan_progress", mode: "read", reason: "x", input: {}, riskLevel: "low" },
      { id: "s2", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" },
    ],
  });
  assert.equal(result.ok, true);
});

test("validator unchanged: write+dry_run+draft without missing info passes", () => {
  const result = validateLLMToolPlan({
    goal: "计划日程", intent: "schedule_plan", confidence: 0.88,
    steps: [
      { id: "s1", toolName: "compose_plan", mode: "draft", reason: "x", input: {}, riskLevel: "medium" },
      { id: "s2", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, dependsOn: ["s1"], riskLevel: "medium" },
    ],
  });
  assert.equal(result.ok, true);
});
