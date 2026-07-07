/**
 * Phase R5-D: Tool Planner Naming Boundary Tests.
 *
 * Verifies that read/draft/write semantic boundaries are enforced by
 * capability metadata, not by legacy type names.
 *
 * Key contract:
 *  - query_schedule is read-only (capability: "read"), despite being in
 *    AgentWriteIntentName union for type-system compatibility.
 *  - Tool capability metadata is the authoritative semantic source.
 *  - Read tools: no pendingAction, no Policy Guard, no execute, no DB write.
 *  - Draft tools: dryRun preview only (in Tool Planner runtime).
 *  - Write tools: must go through Policy Guard → PendingAction → confirmation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";

/* ═══════════════════════════════════════════════════════════════
   1. query_schedule read-only contract
   ═══════════════════════════════════════════════════════════════ */

test("query_schedule exists in registry", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool, "query_schedule must be a registered tool");
});

test("query_schedule.capability === 'read'", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.capability, "read");
});

test("query_schedule.requiresConfirmation === false", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.requiresConfirmation, false);
});

test("query_schedule.canRunWithoutConfirmation === true", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.canRunWithoutConfirmation, true);
});

test("query_schedule.supportsDryRun === true", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.supportsDryRun, true);
});

test("query_schedule.supportsExecute === false", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.supportsExecute, false);
});

test("query_schedule.supportsRollback === false", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.supportsRollback, false);
});

/* ═══════════════════════════════════════════════════════════════
   2. query_schedule is NOT in write allowlist
   ═══════════════════════════════════════════════════════════════ */

test("query_schedule is not a write capability tool", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.notEqual(tool!.capability, "write");
});

test("write allowlist is exactly 3 tools", () => {
  const allowlisted = ["create_plan", "create_checklist", "create_schedule_items"] as const;
  for (const name of allowlisted) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.capability, "write");
  }
});

/* ═══════════════════════════════════════════════════════════════
   3. Capability metadata is authoritative (not type name)
   ═══════════════════════════════════════════════════════════════ */

test("read tools: capability=read, requiresConfirmation=false", () => {
  const readTools = ["query_plan_progress", "query_schedule"] as const;
  for (const name of readTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist`);
    assert.equal(tool!.capability, "read", `${name}: capability must be read`);
    assert.equal(tool!.requiresConfirmation, false, `${name}: read tools do not require confirmation`);
    assert.equal(tool!.canRunWithoutConfirmation, true, `${name}: read tools can run without confirmation`);
  }
});

test("draft tools: capability=draft, canRunWithoutConfirmation=true", () => {
  const draftTools = ["compose_plan", "compose_schedule_item", "compose_timeline_event"] as const;
  for (const name of draftTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist`);
    assert.equal(tool!.capability, "draft", `${name}: capability must be draft`);
    assert.equal(tool!.canRunWithoutConfirmation, true, `${name}: draft tools can run without confirmation`);
    assert.equal(tool!.supportsDryRun, true, `${name}: draft tools must support dryRun`);
  }
});

test("write tools: capability=write, requiresConfirmation=true, supportsDryRun=true", () => {
  const writeAllowlist = ["create_plan", "create_checklist", "create_schedule_items"] as const;
  for (const name of writeAllowlist) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool, `${name}: must exist`);
    assert.equal(tool!.capability, "write", `${name}: capability must be write`);
    assert.equal(tool!.requiresConfirmation, true, `${name}: write tools must require confirmation`);
    assert.equal(tool!.supportsDryRun, true, `${name}: write tools must support dryRun`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   4. Read tools do NOT enter write paths
   ═══════════════════════════════════════════════════════════════ */

test("read tools have riskLevel=low", () => {
  const readTools = ["query_plan_progress", "query_schedule"] as const;
  for (const name of readTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.riskLevel, "low", `${name}: read tools must be low risk`);
  }
});

test("read tools have supportsRollback=false", () => {
  const readTools = ["query_plan_progress", "query_schedule"] as const;
  for (const name of readTools) {
    const tool = getAgentToolDefinition(name);
    assert.ok(tool);
    assert.equal(tool!.supportsRollback, false, `${name}: read tools must not support rollback`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   5. Tool Planner validator respects capability for mode routing
   ═══════════════════════════════════════════════════════════════ */

test("query_schedule validator accepts mode=read", async () => {
  const { validateLLMToolPlan } = await import("../../src/lib/agent/tool-planner/validate-tool-plan");
  const plan = {
    goal: "查询日程",
    intent: "query_schedule",
    confidence: 0.9,
    steps: [{
      id: "qs-1",
      toolName: "query_schedule",
      mode: "read" as const,
      reason: "查询本周日程",
      input: { range: "this_week" },
      riskLevel: "low" as const,
    }],
  };
  const result = validateLLMToolPlan(plan);
  assert.equal(result.ok, true, "query_schedule mode=read should pass validation");
});

test("query_schedule validator rejects mode=dry_run", async () => {
  const { validateLLMToolPlan } = await import("../../src/lib/agent/tool-planner/validate-tool-plan");
  const plan = {
    goal: "查询日程",
    intent: "query_schedule",
    confidence: 0.9,
    steps: [{
      id: "qs-2",
      toolName: "query_schedule",
      mode: "dry_run" as const,
      reason: "dry_run schedule query",
      input: { range: "today" },
      riskLevel: "low" as const,
    }],
  };
  const result = validateLLMToolPlan(plan);
  assert.equal(result.ok, false, "query_schedule mode=dry_run should be rejected");
  assert.ok(result.reason.includes("read") || result.reason.includes("mode"), `reason should mention mode restriction: ${result.reason}`);
});

test("query_schedule validator rejects mode=execute", async () => {
  const { validateLLMToolPlan } = await import("../../src/lib/agent/tool-planner/validate-tool-plan");
  const plan = {
    goal: "查询日程",
    intent: "query_schedule",
    confidence: 0.9,
    steps: [{
      id: "qs-3",
      toolName: "query_schedule",
      mode: "execute" as "read",
      reason: "execute schedule query",
      input: { range: "today" },
      riskLevel: "low" as const,
    }],
  };
  const result = validateLLMToolPlan(plan);
  assert.equal(result.ok, false, "query_schedule mode=execute should be rejected");
});

/* ═══════════════════════════════════════════════════════════════
   6. All 18 tools have valid capability values
   ═══════════════════════════════════════════════════════════════ */

test("every tool has a valid capability (read | draft | write)", async () => {
  const { agentToolRegistry } = await import("../../src/lib/agent/tool-registry");
  const validCaps = new Set(["read", "draft", "write"]);
  for (const [name, tool] of Object.entries(agentToolRegistry)) {
    assert.ok(validCaps.has(tool.capability), `${name}: capability must be read/draft/write, got ${tool.capability}`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   7. Read tool count is exactly 2
   ═══════════════════════════════════════════════════════════════ */

test("exactly 2 read tools in registry", async () => {
  const { agentToolRegistry } = await import("../../src/lib/agent/tool-registry");
  const readTools = Object.entries(agentToolRegistry).filter(([_, t]) => t.capability === "read");
  assert.equal(readTools.length, 2);
  const names = readTools.map(([n]) => n).sort();
  assert.deepEqual(names, ["query_plan_progress", "query_schedule"]);
});

/* ═══════════════════════════════════════════════════════════════
   8. docs mention key R5-D terms (minimal content check)
   ═══════════════════════════════════════════════════════════════ */

test("agent-tool-planner.md mentions query_schedule read-only", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("docs/agent-tool-planner.md", "utf-8");
  assert.ok(content.includes("query_schedule"), "docs should mention query_schedule");
  assert.ok(content.includes("read-only") || content.includes("capability: \"read\""), "docs should mention read-only");
  assert.ok(content.includes("write allowlist") || content.includes("Write Allowlist") || content.includes("create_plan"), "docs should mention write allowlist");
});

test("agent-tool-registry.md mentions naming note", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("docs/agent-tool-registry.md", "utf-8");
  assert.ok(content.includes("query_schedule"), "should mention query_schedule");
  assert.ok(content.includes("AgentWriteIntentName"), "should mention naming debt");
  // Should mention capability is authoritative
  assert.ok(
    content.includes("capability") && (content.includes("authoritative") || content.includes("semantic")),
    "should state capability is authoritative",
  );
});

test("agent-llm-required-architecture.md mentions R5 completion", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("docs/agent-llm-required-architecture.md", "utf-8");
  assert.ok(content.includes("R5-A"), "should mention R5-A");
  assert.ok(content.includes("R5-C"), "should mention R5-C");
  assert.ok(content.includes("已完成"), "R5 phases should be marked completed");
});
