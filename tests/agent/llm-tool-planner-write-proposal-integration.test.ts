/** Phase LLM-R4C: Integration tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runToolPlannerGraphRuntime } from "../../src/lib/agent/tool-planner/langgraph-runtime";
import { isAgentToolPlannerWriteProposalsEnabled } from "../../src/lib/agent/tool-planner";

const saveEnv = (k: string) => ({ had: Object.hasOwn(process.env, k), value: process.env[k] });
const restoreEnv = (k: string, p: ReturnType<typeof saveEnv>) => { if (p.had) process.env[k] = p.value; else delete process.env[k]; };

test("graph runtime completes with R4C nodes", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "查看计划进度" });
  assert.ok(result.status);
  assert.ok(Array.isArray(result.traceEvents));
  assert.ok(Array.isArray(result.stepResults));
});

test("graph runtime trace has no secrets", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result.traceEvents);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
});

test("graph runtime does not call execute", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("\"execute\""));
});

test("graph runtime does not create pendingAction", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("pendingAction"));
});

test("graph runtime does not trigger rollback", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("rollbackPayload"));
});

test("feature flag independent from graph runtime flag", () => {
  const prevW = saveEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS");
  const prevG = saveEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME");
  process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS = "1";
  delete process.env.AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME;
  try {
    assert.equal(isAgentToolPlannerWriteProposalsEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS", prevW);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME", prevG);
  }
});
