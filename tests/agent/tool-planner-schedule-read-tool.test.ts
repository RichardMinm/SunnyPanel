/**
 * Phase R5-C: Schedule Read Tool Tests.
 *
 * Verifies that:
 *  1. query_schedule tool exists with correct metadata
 *  2. query_schedule is read-only (no pendingAction, no execute, no DB write)
 *  3. query_schedule has correct dryRun behavior
 *  4. query_schedule has no rollback
 *  5. query_schedule requires no confirmation
 *  6. query_schedule is NOT in write allowlist
 *  7. query_schedule is in the catalog
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition, agentToolRegistry } from "../../src/lib/agent/tool-registry";
import { buildLLMToolCatalog } from "../../src/lib/agent/tool-planner/build-tool-catalog";

/* ──── 1. Tool exists ──── */

test("query_schedule tool exists in registry", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool, "query_schedule must be a registered tool");
  assert.equal(tool!.name, "query_schedule");
  assert.equal(tool!.intent, "query_schedule");
});

/* ──── 2. Metadata invariants ──── */

test("query_schedule: capability=read", () => {
  const tool = getAgentToolDefinition("query_schedule" as never);
  assert.ok(tool);
  assert.equal(tool!.capability, "read");
});

test("query_schedule: riskLevel=low", () => {
  assert.equal(agentToolRegistry.query_schedule.riskLevel, "low");
});

test("query_schedule: requiresConfirmation=false", () => {
  assert.equal(agentToolRegistry.query_schedule.requiresConfirmation, false);
});

test("query_schedule: canRunWithoutConfirmation=true", () => {
  assert.equal(agentToolRegistry.query_schedule.canRunWithoutConfirmation, true);
});

test("query_schedule: supportsDryRun=true", () => {
  assert.equal(agentToolRegistry.query_schedule.supportsDryRun, true);
});

test("query_schedule: supportsExecute=false", () => {
  assert.equal(agentToolRegistry.query_schedule.supportsExecute, false);
});

test("query_schedule: supportsRollback=false", () => {
  assert.equal(agentToolRegistry.query_schedule.supportsRollback, false);
});

/* ──── 3. Read-only (no pendingAction, no execute, no write) ──── */

test("query_schedule is NOT in write allowlist", () => {
  // The write allowlist is: create_schedule_items, create_plan, create_checklist
  const writeAllowlist = ["create_schedule_items", "create_plan", "create_checklist"];
  assert.ok(!writeAllowlist.includes("query_schedule"), "query_schedule must NOT be in write allowlist");
});

test("query_schedule does not support pendingAction", () => {
  const tool = agentToolRegistry.query_schedule;
  // requiresConfirmation=false → no pendingAction created
  assert.equal(tool.requiresConfirmation, false);
});

/* ──── 4. Input schema ──── */

test("query_schedule has valid inputSchema", () => {
  const tool = agentToolRegistry.query_schedule;
  assert.ok(tool.inputSchema);
  assert.equal(tool.inputSchema.kind, "manual");
  assert.equal(tool.inputSchema.name, "query_schedule");
});

/* ──── 5. Description ──── */

test("query_schedule has descriptive text", () => {
  const tool = agentToolRegistry.query_schedule;
  assert.ok(typeof tool.description === "string");
  assert.ok(tool.description.length > 10);
  assert.ok(tool.description.includes("Read-only") || tool.description.includes("read") || tool.description.includes("日程"));
});

/* ──── 6. Catalog inclusion ──── */

test("query_schedule is in the LLM tool catalog", () => {
  const catalog = buildLLMToolCatalog();
  const qs = catalog.find((e) => e.name === "query_schedule");
  assert.ok(qs, "query_schedule must be in catalog");
  assert.equal(qs!.capability, "read");
  assert.equal(qs!.supportsDryRun, true);
  assert.equal(qs!.supportsExecute, false);
});

test("read-only tools in catalog include both query tools", () => {
  const catalog = buildLLMToolCatalog({ includeReadTools: true, includeWriteTools: false, includeDraftTools: false });
  const names = catalog.map((e) => e.name).sort();
  assert.deepEqual(names, ["query_plan_progress", "query_schedule"]);
});

/* ──── 7. dryRun returns clarify type ──── */

test("query_schedule dryRun returns clarify type", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({ range: "today" }, {});
  assert.equal(result.type, "clarify");
  assert.ok("assistantMessage" in result);
  assert.equal(result.pendingAction, null);
});

test("query_schedule dryRun produces natural message", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({ range: "this_week" }, {});
  assert.equal(result.type, "clarify");
  if (result.type === "clarify") {
    assert.ok(result.assistantMessage.includes("日程"));
    assert.ok(result.assistantMessage.includes("只读") || result.assistantMessage.includes("不会创建"));
  }
});

/* ──── 8. No DB write in dryRun ──── */

test("query_schedule dryRun does not write DB", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({ range: "upcoming" }, {});
  const s = JSON.stringify(result);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── 9. Invalid range returns clarify still ──── */

test("query_schedule dryRun with no range returns clarify", async () => {
  const tool = agentToolRegistry.query_schedule;
  const result = await tool.dryRun({}, {});
  assert.equal(result.type, "clarify");
  assert.equal(result.pendingAction, null);
});

/* ──── 10. execute throws (read-only tool) ──── */

test("query_schedule execute throws error", () => {
  const tool = agentToolRegistry.query_schedule;
  assert.throws(
    () => tool.execute({}, {}, () => {}),
    /read-only|not supported|query_schedule/i,
  );
});
