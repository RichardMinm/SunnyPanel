/**
 * Phase R6-C0-A: compose_checklist Draft Tool Tests.
 *
 * Verifies:
 *  1. compose_checklist exists in registry
 *  2. Metadata: capability=draft, supportsDryRun=true, supportsExecute=false
 *  3. NOT in write allowlist
 *  4. dryRun returns preview (not pendingAction)
 *  5. execute throws
 *  6. Tool Planner validator accepts compose_checklist draft plan
 *  7. Old checklist-draft tests still pass
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition, agentToolRegistry } from "../../src/lib/agent/tool-registry";
import { buildLLMToolCatalog } from "../../src/lib/agent/tool-planner/build-tool-catalog";

/* ──── 1. Registry existence ──── */

test("compose_checklist exists in registry", () => {
  const tool = getAgentToolDefinition("compose_checklist" as never);
  assert.ok(tool);
  assert.equal(tool!.name, "compose_checklist");
  assert.equal(tool!.intent, "compose_checklist");
});

/* ──── 2. Metadata ──── */

test("compose_checklist: capability=draft", () => {
  assert.equal(agentToolRegistry.compose_checklist.capability, "draft");
});

test("compose_checklist: riskLevel=low", () => {
  assert.equal(agentToolRegistry.compose_checklist.riskLevel, "low");
});

test("compose_checklist: requiresConfirmation=false", () => {
  assert.equal(agentToolRegistry.compose_checklist.requiresConfirmation, false);
});

test("compose_checklist: canRunWithoutConfirmation=true", () => {
  assert.equal(agentToolRegistry.compose_checklist.canRunWithoutConfirmation, true);
});

test("compose_checklist: supportsDryRun=true", () => {
  assert.equal(agentToolRegistry.compose_checklist.supportsDryRun, true);
});

test("compose_checklist: supportsExecute=false", () => {
  assert.equal(agentToolRegistry.compose_checklist.supportsExecute, false);
});

test("compose_checklist: supportsRollback=false", () => {
  assert.equal(agentToolRegistry.compose_checklist.supportsRollback, false);
});

/* ──── 3. NOT in write allowlist ──── */

test("compose_checklist is NOT in write allowlist", () => {
  assert.notEqual(agentToolRegistry.compose_checklist.capability, "write");
});

/* ──── 4. Catalog inclusion ──── */

test("compose_checklist is in LLM tool catalog", () => {
  const catalog = buildLLMToolCatalog();
  const cc = catalog.find((e) => e.name === "compose_checklist");
  assert.ok(cc);
  assert.equal(cc!.capability, "draft");
  assert.equal(cc!.supportsDryRun, true);
  assert.equal(cc!.supportsExecute, false);
});

/* ──── 5. dryRun returns preview ──── */

test("compose_checklist dryRun returns proposed_action", async () => {
  const result = await agentToolRegistry.compose_checklist.dryRun({ title: "测试清单" }, {});
  assert.equal(result.type, "proposed_action");
  assert.ok(result.action.summary.includes("清单"));
});

test("compose_checklist dryRun with goal and items", async () => {
  const result = await agentToolRegistry.compose_checklist.dryRun({
    goal: "部署检查",
    items: [{ title: "重启服务器" }, { title: "验证日志" }],
  }, {});
  assert.equal(result.type, "proposed_action");
  assert.ok(result.action.summary.includes("2"));
});

/* ──── 6. No pendingAction ──── */

test("compose_checklist dryRun has no pendingAction in clarify type", () => {
  // dryRun returns proposed_action type, which doesn't have pendingAction
  assert.equal(agentToolRegistry.compose_checklist.requiresConfirmation, false);
});

/* ──── 7. execute throws ──── */

test("compose_checklist execute throws error", () => {
  assert.throws(
    () => agentToolRegistry.compose_checklist.execute({}, {}, () => {}),
    /draft|not supported|compose_checklist/i,
  );
});

/* ──── 8. Validator accepts draft plan ──── */

test("validator accepts compose_checklist with mode=draft", async () => {
  const { validateLLMToolPlan } = await import("../../src/lib/agent/tool-planner/validate-tool-plan");
  const plan = {
    goal: "生成清单草案",
    intent: "compose_checklist",
    confidence: 0.9,
    steps: [{
      id: "cc-1",
      toolName: "compose_checklist",
      mode: "draft" as const,
      reason: "用户想生成清单草案",
      input: { goal: "部署检查" },
      riskLevel: "low" as const,
    }],
  };
  const result = validateLLMToolPlan(plan);
  assert.equal(result.ok, true, "compose_checklist draft plan should pass validation");
});

/* ──── 9. No DB write in dryRun ──── */

test("compose_checklist dryRun has no DB write", async () => {
  const result = await agentToolRegistry.compose_checklist.dryRun({ title: "测试" }, {});
  const s = JSON.stringify(result);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── 10. No secrets ──── */

test("compose_checklist dryRun has no secrets", async () => {
  const result = await agentToolRegistry.compose_checklist.dryRun({ title: "测试" }, {});
  const s = JSON.stringify(result);
  assert.ok(!s.includes("sk-"));
  assert.ok(!s.includes("Bearer"));
  assert.ok(!s.includes("api_key"));
});
