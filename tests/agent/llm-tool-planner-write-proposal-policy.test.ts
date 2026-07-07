/** Phase LLM-R4C: Policy Guard + pending preview tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";
import { validateLLMToolPlan } from "../../src/lib/agent/tool-planner";

/* Validator remains strict */
test("validator rejects write tool with mode=read", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "read", reason: "x", input: {}, riskLevel: "low" }] });
  assert.equal(r.ok, false);
});

test("validator rejects execute mode", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "execute", reason: "x", input: {}, riskLevel: "high" }] });
  assert.equal(r.ok, false);
});

test("validator accepts write tool with dry_run", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }] });
  assert.equal(r.ok, true);
});

test("validator accepts all 3 allowlist tools in dry_run", () => {
  for (const name of ["create_schedule_items", "create_plan", "create_checklist"]) {
    const r = validateLLMToolPlan({ goal: "t", intent: name, confidence: 0.9, steps: [{ id: "s1", toolName: name, mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }] });
    assert.equal(r.ok, true, `${name} should be valid`);
  }
});

/* Preview-only: no pendingAction created by validator */
test("validator output has no pendingAction", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }] });
  const s = JSON.stringify(r);
  assert.ok(!s.includes("pendingAction"));
});

/* Preview-only: no execute, no DB write */
test("validator output has no execute or write claim", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }] });
  const s = JSON.stringify(r);
  assert.ok(!s.includes("executed"));
});

/* Trace sanitized */
test("validator trace has no secrets", () => {
  const r = validateLLMToolPlan({ goal: "t", intent: "create_plan", confidence: 0.9, steps: [{ id: "s1", toolName: "create_plan", mode: "dry_run", reason: "x", input: {}, riskLevel: "medium" }] });
  const s = JSON.stringify(r);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("api_key"));
});
