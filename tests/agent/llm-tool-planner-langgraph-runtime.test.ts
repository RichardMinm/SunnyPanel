/**
 * Phase LLM-R4B: LangGraph runtime unit tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runToolPlannerGraphRuntime } from "../../src/lib/agent/tool-planner/langgraph-runtime";
import { isAgentToolPlannerGraphRuntimeEnabled } from "../../src/lib/agent/tool-planner";

const saveEnv = (key: string) => ({ had: Object.hasOwn(process.env, key), value: process.env[key] });
const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) process.env[key] = prev.value; else delete process.env[key];
};

test("feature flag returns false by default", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");
  delete process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME;
  try { assert.equal(isAgentToolPlannerGraphRuntimeEnabled(), false); }
  finally { restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prev); }
});

test("feature flag returns true when set", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");
  process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME = "1";
  try { assert.equal(isAgentToolPlannerGraphRuntimeEnabled(), true); }
  finally { restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prev); }
});

test("graph runtime completes without throwing", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "查看计划" });
  assert.ok(result.status);
  assert.ok(Array.isArray(result.traceEvents));
});

test("graph runtime records trace events", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "查看计划" });
  assert.ok(result.traceEvents.length > 0);
  for (const e of result.traceEvents) assert.equal(e.phase, "tool_planning");
});

test("graph runtime trace has no secrets", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result.traceEvents);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
});

test("graph runtime does not create pendingAction", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("pendingAction"));
});

test("graph runtime has stepResults", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "查看计划进度" });
  assert.ok(Array.isArray(result.stepResults));
});
