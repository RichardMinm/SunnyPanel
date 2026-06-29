import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePolicyGuard } from "../../src/lib/agent/policy/tool-gate";
import { applyPolicyGuard } from "../../src/lib/agent/policy/guard";
import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import type { AgentIntent } from "../../src/lib/agent/schemas";

const routerFor = (intent: AgentIntent) =>
  normalizeRouterOutput({ intent });

test("query action blocks write intents", () => {
  const intent: AgentIntent = {
    args: { title: "测试计划" },
    intent: "create_plan",
  };
  const router = { ...routerFor(intent), action: "query" as const, requiresWrite: false };
  const result = evaluatePolicyGuard(router);

  assert.equal(result.allowed, false);
  assert.match(result.reason, /不允许写入/);
});

test("capability action has no write tools in pool", () => {
  const intent: AgentIntent = {
    args: { answer: "我可以帮你管理计划" },
    intent: "capability_query",
  };
  const router = routerFor(intent);

  assert.equal(router.action, "capability");
  assert.deepEqual(evaluatePolicyGuard(router).allowedTools, []);
});

test("delete action allows delete_record only", () => {
  const intent: AgentIntent = {
    args: { entityName: "测试计划", entityType: "plan" },
    intent: "delete_record",
  };
  const router = routerFor(intent);
  const policy = evaluatePolicyGuard(router);

  assert.equal(policy.allowed, true);
  assert.ok(policy.allowedTools.includes("delete_record"));
});

test("arbitration-aligned delete_record requires write", async () => {
  const { intentRequiresWrite } = await import("../../src/lib/agent/intent/arbitration");
  const intent: AgentIntent = {
    args: { entityName: "x", entityType: "plan" },
    intent: "delete_record",
  };

  assert.equal(intentRequiresWrite(intent), true);
});

test("applyPolicyGuard blocks dryRun on query", () => {
  const intent: AgentIntent = {
    args: { planTitle: "x" },
    intent: "query_plan_progress",
  };
  const router = { ...routerFor(intent), action: "query" as const, requiresWrite: false };
  const guard = applyPolicyGuard({ router });

  assert.equal(guard.writeRequired, false);
  assert.equal(guard.allowDryRun, false);
  assert.equal(guard.allowExecute, false);
});

test("applyPolicyGuard allows preview on delete with high risk", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划", entityType: "plan" },
    intent: "delete_record",
  };
  const router = routerFor(intent);
  const guard = applyPolicyGuard({ router });

  assert.equal(guard.riskLevel, "high");
  assert.equal(guard.mustShowImpactPreview, true);
  assert.equal(guard.allowDryRun, true);
  assert.equal(guard.allowExecute, true);
});

test("applyPolicyGuard blocks preview when resolver not unique", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划", entityType: "plan" },
    intent: "delete_record",
  };
  const router = routerFor(intent);
  const guard = applyPolicyGuard({ resolverStatus: "ambiguous", router });

  assert.equal(guard.allowDryRun, false);
  assert.equal(guard.allowExecute, false);
});

test("evaluatePolicyGuard includes capability lists", () => {
  const intent: AgentIntent = {
    args: { title: "学习计划" },
    intent: "create_plan",
  };
  const policy = evaluatePolicyGuard(routerFor(intent));

  assert.ok(Array.isArray(policy.allowedCapabilities));
  assert.ok(policy.allowedCapabilities?.includes("preview_create_plan"));
  assert.ok(Array.isArray(policy.exposableToLLM));
});
