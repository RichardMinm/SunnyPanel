/** Phase LLM-R4D: Real Policy Guard tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPolicyGuard } from "../../src/lib/agent/policy/guard";
import { evaluatePolicyGuard } from "../../src/lib/agent/policy/tool-gate";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";
import type { AgentRouterOutput } from "../../src/lib/agent/router/types";

/* Build a synthetic AgentRouterOutput for Policy Guard evaluation, mirroring R4D's buildSyntheticRouterOutput. */
const buildTestRouterOutput = (
  toolName: string,
  overrides?: Partial<AgentRouterOutput>,
): AgentRouterOutput => ({
  action: "create",
  confidence: 0.9,
  intent: { intent: toolName, args: {}, confidence: 0.9 } as AgentRouterOutput["intent"],
  reason: "test",
  requiresWrite: true,
  target: {},
  ...overrides,
});

/* ──── Real Policy Guard is called (not preview-only) ──── */

test("applyPolicyGuard evaluates write tool as create action", () => {
  const router = buildTestRouterOutput("create_schedule_items");
  const result = applyPolicyGuard({ router });
  assert.equal(result.allowDryRun, true);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.writeRequired, true);
});

test("evaluatePolicyGuard allows allowlisted write tool", () => {
  const router = buildTestRouterOutput("create_schedule_items");
  const result = evaluatePolicyGuard(router, { userContext: { userId: 1 } });
  assert.equal(result.allowed, true);
});

test("evaluatePolicyGuard allows create_plan", () => {
  const router = buildTestRouterOutput("create_plan");
  const result = evaluatePolicyGuard(router, { userContext: { userId: 1 } });
  assert.equal(result.allowed, true);
});

test("evaluatePolicyGuard allows create_checklist", () => {
  const router = buildTestRouterOutput("create_checklist");
  const result = evaluatePolicyGuard(router, { userContext: { userId: 1 } });
  assert.equal(result.allowed, true);
});

/* ──── Policy Guard blocked scenarios ──── */

test("applyPolicyGuard blocks query action with write intent", () => {
  const router = buildTestRouterOutput("create_schedule_items", { action: "query", requiresWrite: false });
  const result = applyPolicyGuard({ router });
  assert.equal(result.allowDryRun, false);
  assert.equal(result.allowExecute, false);
});

test("applyPolicyGuard blocks when resolver status is ambiguous", () => {
  const router = buildTestRouterOutput("create_schedule_items");
  const result = applyPolicyGuard({ resolverStatus: "ambiguous", router });
  assert.equal(result.allowDryRun, false);
});

/* ──── Real Policy Guard results contain required fields ──── */

test("applyPolicyGuard result has all required fields", () => {
  const router = buildTestRouterOutput("create_plan");
  const result = applyPolicyGuard({ router });
  assert.ok("allowDryRun" in result);
  assert.ok("allowExecute" in result);
  assert.ok("requiresConfirmation" in result);
  assert.ok("riskLevel" in result);
  assert.ok("reason" in result);
  assert.ok("writeRequired" in result);
});

test("evaluatePolicyGuard result has all required fields", () => {
  const router = buildTestRouterOutput("create_checklist");
  const result = evaluatePolicyGuard(router, { userContext: { userId: 1 } });
  assert.ok("allowed" in result);
  assert.ok("allowedTools" in result);
  assert.ok("plannedTools" in result);
  assert.ok("reason" in result);
});

/* ──── Policy Guard output is not raw/preview-only ──── */

test("policy guard output does not contain preview-only marker", () => {
  const router = buildTestRouterOutput("create_schedule_items");
  const result = applyPolicyGuard({ router });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("preview_only"));
  assert.ok(!s.includes("preview-only"));
});

/* ──── Allowlist tools have requiresConfirmation=true ──── */

test("allowlist tools require confirmation", () => {
  for (const name of ["create_schedule_items", "create_plan", "create_checklist"]) {
    const def = getAgentToolDefinition(name as keyof typeof import("../../src/lib/agent/tool-registry").agentToolRegistry);
    assert.ok(def, `${name} must exist in tool registry`);
    assert.equal(def!.requiresConfirmation, true, `${name} must require confirmation`);
    assert.equal(def!.supportsDryRun, true, `${name} must support dryRun`);
    assert.equal(def!.supportsExecute, true, `${name} must support execute`);
  }
});

/* ──── Trace sanitization ──── */

test("policy guard output has no secrets", () => {
  const router = buildTestRouterOutput("create_schedule_items");
  const result = applyPolicyGuard({ router });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
  assert.ok(!s.includes("token"));
  assert.ok(!s.includes("secret"));
});

test("tool gate result has no secrets", () => {
  const router = buildTestRouterOutput("create_plan");
  const result = evaluatePolicyGuard(router, { userContext: { userId: 1 } });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
});
