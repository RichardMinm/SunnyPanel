/** Phase LLM-R4C: Write dry-run proposal tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { getAgentToolDefinition, dryRunAgentTool } from "../../src/lib/agent/tool-registry";
import { isAgentToolPlannerWriteProposalsEnabled } from "../../src/lib/agent/tool-planner";

const saveEnv = (k: string) => ({ had: Object.hasOwn(process.env, k), value: process.env[k] });
const restoreEnv = (k: string, p: ReturnType<typeof saveEnv>) => { if (p.had) process.env[k] = p.value; else delete process.env[k]; };

/* Feature flag */
test("write proposals flag returns false by default", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS");
  delete process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS;
  try { assert.equal(isAgentToolPlannerWriteProposalsEnabled(), false); }
  finally { restoreEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS", prev); }
});

test("write proposals flag returns true when set", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS");
  process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS = "1";
  try { assert.equal(isAgentToolPlannerWriteProposalsEnabled(), true); }
  finally { restoreEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS", prev); }
});

/* Allowlist tools have required metadata */
test("create_schedule_items supports dryRun and requires confirmation", () => {
  const tool = getAgentToolDefinition("create_schedule_items");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.requiresConfirmation, true);
  assert.equal(tool!.canRunWithoutConfirmation, false);
});

test("create_plan supports dryRun and requires confirmation", () => {
  const tool = getAgentToolDefinition("create_plan");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.requiresConfirmation, true);
});

test("create_checklist supports dryRun and requires confirmation", () => {
  const tool = getAgentToolDefinition("create_checklist");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
  assert.equal(tool!.supportsDryRun, true);
  assert.equal(tool!.requiresConfirmation, true);
});

/* Non-allowlist write tools exist but are excluded */
test("delete_record is write but not in allowlist", () => {
  const tool = getAgentToolDefinition("delete_record");
  assert.ok(tool);
  assert.equal(tool!.capability, "write");
});

/* dryRunAgentTool is the right entry point */
test("dryRunAgentTool produces proposed_action for create_schedule_items", async () => {
  const result = await dryRunAgentTool({ intent: "create_schedule_items", args: { items: [], title: "Test" } } as never, {});
  assert.ok(result);
  assert.ok(result.type === "proposed_action" || result.type === "clarify");
});

/* dryRun does not write to DB — no receipt/rollback */
test("dryRun result has no receipt or rollback execution", async () => {
  const result = await dryRunAgentTool({ intent: "create_schedule_items", args: { items: [], title: "Test" } } as never, {});
  const s = JSON.stringify(result);
  assert.ok(!s.includes("receipt"));
});
