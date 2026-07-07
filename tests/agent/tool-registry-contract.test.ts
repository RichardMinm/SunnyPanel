/**
 * Phase LLM-R2: Tool Registry Contract Tests
 *
 * Verifies that all 17 AgentToolDefinition entries have the required
 * LLM-R2 metadata fields and that capability/riskLevel/rollback
 * invariants hold across the registry.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { agentToolRegistry } from "../../src/lib/agent/tool-registry";
import type { AgentToolCapability, AgentToolInputSchema } from "../../src/lib/agent/tool-registry";

const tools = Object.entries(agentToolRegistry);
const toolNames = Object.keys(agentToolRegistry);

/* ──── Metadata completeness ──── */

test("all 19 tools have required metadata fields", () => {
  assert.equal(toolNames.length, 19, "Registry must have exactly 19 tools");
  for (const [name, tool] of tools) {
    assert.ok(tool.name, `${name}: missing name`);
    assert.ok(tool.intent, `${name}: missing intent`);
    assert.ok(typeof tool.description === "string" && tool.description.length > 0, `${name}: missing description`);
    assert.ok(tool.capability, `${name}: missing capability`);
    assert.ok(tool.riskLevel, `${name}: missing riskLevel`);
    assert.ok(tool.inputSchema, `${name}: missing inputSchema`);
    assert.equal(typeof tool.requiresConfirmation, "boolean", `${name}: requiresConfirmation must be boolean`);
    assert.equal(typeof tool.canRunWithoutConfirmation, "boolean", `${name}: canRunWithoutConfirmation must be boolean`);
    assert.equal(typeof tool.supportsDryRun, "boolean", `${name}: supportsDryRun must be boolean`);
    assert.equal(typeof tool.supportsExecute, "boolean", `${name}: supportsExecute must be boolean`);
    assert.equal(typeof tool.supportsRollback, "boolean", `${name}: supportsRollback must be boolean`);
  }
});

test("all tool names are unique", () => {
  const names = Object.keys(agentToolRegistry);
  assert.equal(new Set(names).size, names.length);
});

test("all tool intents match names", () => {
  for (const [name, tool] of tools) {
    assert.equal(tool.intent, name, `${name}: intent must match name`);
  }
});

test("all tools have inputSchema with valid kind", () => {
  const validKinds = ["write-schema", "json-schema", "manual"];
  for (const [name, tool] of tools) {
    const schema = tool.inputSchema as AgentToolInputSchema;
    assert.ok(validKinds.includes(schema.kind), `${name}: invalid inputSchema kind "${schema.kind}"`);
    assert.ok(schema.name, `${name}: inputSchema missing name`);
  }
});

/* ──── Capability invariants ──── */

test("read tools include query_plan_progress and query_schedule", () => {
  const readTools = tools.filter(([_, t]) => t.capability === "read");
  assert.equal(readTools.length, 2, "should have 2 read tools");
  const names = readTools.map(([n]) => n).sort();
  assert.deepEqual(names, ["query_plan_progress", "query_schedule"]);
});

test("draft tools are compose_checklist, compose_plan, compose_schedule_item, compose_timeline_event", () => {
  const draftNames = tools
    .filter(([_, t]) => t.capability === "draft")
    .map(([n]) => n)
    .sort();
  assert.deepEqual(draftNames, [
    "compose_checklist",
    "compose_plan",
    "compose_schedule_item",
    "compose_timeline_event",
  ]);
});

test("draft tools can run without confirmation", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "draft") {
      assert.equal(tool.canRunWithoutConfirmation, true, `${name}: draft tool must have canRunWithoutConfirmation=true`);
    }
  }
});

test("draft tools support dryRun (all); execute varies", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "draft") {
      assert.equal(tool.supportsDryRun, true, `${name}: draft must support dry-run`);
      // compose_checklist is draft-preview-only (R6-C0-A)
      if (name === "compose_checklist") {
        assert.equal(tool.supportsExecute, false, `${name}: compose_checklist is preview-only`);
      } else {
        assert.equal(tool.supportsExecute, true, `${name}: draft must support execute`);
      }
    }
  }
});

test("remaining tools are write (13 tools)", () => {
  const writeNames = tools
    .filter(([_, t]) => t.capability === "write")
    .map(([n]) => n)
    .sort();
  assert.equal(writeNames.length, 13, "Expected 13 write tools");
  // No draft or read tool should be in write list
  assert.ok(!writeNames.includes("compose_plan"));
  assert.ok(!writeNames.includes("compose_schedule_item"));
  assert.ok(!writeNames.includes("compose_timeline_event"));
  assert.ok(!writeNames.includes("query_plan_progress"));
});

test("no write tool has canRunWithoutConfirmation", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "write") {
      assert.equal(tool.canRunWithoutConfirmation, false, `${name}: write tool must have canRunWithoutConfirmation=false`);
    }
  }
});

test("all write tools require confirmation", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "write") {
      assert.equal(tool.requiresConfirmation, true, `${name}: write tool must require confirmation`);
    }
  }
});

test("all write tools support dry-run", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "write") {
      assert.equal(tool.supportsDryRun, true, `${name}: write tool must support dry-run`);
    }
  }
});

test("all write tools support execute", () => {
  for (const [name, tool] of tools) {
    if (tool.capability === "write") {
      assert.equal(tool.supportsExecute, true, `${name}: write tool must support execute`);
    }
  }
});

/* ──── Read tool invariants ──── */

test("read tool requires no confirmation", () => {
  const qpp = agentToolRegistry.query_plan_progress;
  assert.equal(qpp.requiresConfirmation, false);
  assert.equal(qpp.canRunWithoutConfirmation, true);
  assert.equal(qpp.supportsDryRun, true);
  assert.equal(qpp.supportsExecute, true);
  assert.equal(qpp.supportsRollback, false);
});

test("read tool has no rollback", () => {
  assert.equal("rollback" in agentToolRegistry.query_plan_progress, false);
});

/* ──── Rollback invariants ──── */

test("supportsRollback matches rollback field presence", () => {
  for (const [name, tool] of tools) {
    const hasRollbackField = "rollback" in tool && tool.rollback !== undefined;
    assert.equal(
      tool.supportsRollback,
      hasRollbackField,
      `${name}: supportsRollback=${tool.supportsRollback} but rollback field present=${hasRollbackField}`,
    );
  }
});

test("tools with rollback have status: planned", () => {
  for (const [name, tool] of tools) {
    if ("rollback" in tool && (tool as Record<string, unknown>).rollback) {
      const rb = tool.rollback as { description: string; status: string };
      assert.equal(rb.status, "planned", `${name}: rollback status must be "planned"`);
      assert.ok(rb.description, `${name}: rollback must have description`);
    }
  }
});

/* ──── Risk level invariants ──── */

const validRiskLevels = ["high", "low", "medium"] as const;

test("all tools have valid risk levels", () => {
  for (const [name, tool] of tools) {
    assert.ok(
      validRiskLevels.includes(tool.riskLevel),
      `${name}: invalid riskLevel "${tool.riskLevel}"`,
    );
  }
});

test("delete_record is high risk", () => {
  assert.equal(agentToolRegistry.delete_record.riskLevel, "high");
});

test("create_schedule_items is medium risk", () => {
  // Original value. audit note: should be "high" after riskLevel decoupled from behavior.
  assert.equal(agentToolRegistry.create_schedule_items.riskLevel, "medium");
});

test("schedule_plan is medium risk", () => {
  // Original value. audit note: should be "high" after riskLevel decoupled from behavior.
  assert.equal(agentToolRegistry.schedule_plan.riskLevel, "medium");
});

test("query_plan_progress is low risk", () => {
  assert.equal(agentToolRegistry.query_plan_progress.riskLevel, "low");
});

test("cancel_schedule_item is low risk", () => {
  assert.equal(agentToolRegistry.cancel_schedule_item.riskLevel, "low");
});

test("high-risk write tools cannot run without confirmation", () => {
  for (const [name, tool] of tools) {
    if (tool.riskLevel === "high" && tool.capability === "write") {
      assert.equal(tool.canRunWithoutConfirmation, false, `${name}: high-risk write tool must have canRunWithoutConfirmation=false`);
    }
  }
});

/* ──── No tool claims capability: rollback (rollback is embedded in write tools) ──── */

test("no tool has capability: rollback", () => {
  // Rollback is embedded in write tools, not a standalone capability
  const rollbackTools = tools.filter(([_, t]) => (t.capability as string) === "rollback");
  assert.equal(rollbackTools.length, 0, "No standalone rollback tools exist");
});
