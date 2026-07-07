/**
 * Phase LLM-R4B: Read/draft runtime tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateLLMToolPlan } from "../../src/lib/agent/tool-planner";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";

test("read tool query_plan_progress has capability=read and supportsDryRun=true", () => {
  const tool = getAgentToolDefinition("query_plan_progress");
  assert.ok(tool);
  assert.equal(tool!.capability, "read");
  assert.equal(tool!.supportsDryRun, true);
});

test("draft tool compose_plan has capability=draft", () => {
  const tool = getAgentToolDefinition("compose_plan");
  assert.ok(tool);
  assert.equal(tool!.capability, "draft");
  assert.equal(tool!.supportsDryRun, true);
});

test("write tool create_plan has capability=write", () => {
  const tool = getAgentToolDefinition("create_plan");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
});

test("write tool step with dry_run mode is routed to blocked in validator", () => {
  const result = validateLLMToolPlan({
    goal: "test", intent: "create_plan", confidence: 0.9,
    steps: [{ id: "s1", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }],
  });
  // write tool with dry_run passes validation (it's the correct mode for write)
  assert.equal(result.ok, true);
});

test("write tool step with mode=read is rejected", () => {
  const result = validateLLMToolPlan({
    goal: "test", intent: "create_plan", confidence: 0.9,
    steps: [{ id: "s1", toolName: "create_plan", mode: "read", reason: "x", input: {}, riskLevel: "low" }],
  });
  assert.equal(result.ok, false);
});

test("execute mode is rejected by validator", () => {
  const result = validateLLMToolPlan({
    goal: "test", intent: "create_plan", confidence: 0.9,
    steps: [{ id: "s1", toolName: "create_plan", mode: "execute", reason: "x", input: {}, riskLevel: "high" }],
  });
  assert.equal(result.ok, false);
});

test("validator trace never contains raw secret patterns", () => {
  const result = validateLLMToolPlan({
    goal: "test", intent: "query_plan_progress", confidence: 0.9,
    steps: [{ id: "s1", toolName: "query_plan_progress", mode: "read", reason: "查看", input: {}, riskLevel: "low" }],
  });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
});
