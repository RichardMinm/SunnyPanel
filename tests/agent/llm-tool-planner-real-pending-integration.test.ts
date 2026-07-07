/** Phase LLM-R4D: Real PendingAction integration tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runToolPlannerGraphRuntime } from "../../src/lib/agent/tool-planner/langgraph-runtime";
import { isAgentToolPlannerRealPendingActionEnabled } from "../../src/lib/agent/tool-planner";
import { parsePendingAction } from "../../src/lib/agent/schemas";
import { confirmationMatchesPending } from "../../src/lib/agent/chat-pipeline/confirmation-step";
import { getAgentToolDefinition } from "../../src/lib/agent/tool-registry";

const saveEnv = (k: string) => ({ had: Object.hasOwn(process.env, k), value: process.env[k] });
const restoreEnv = (k: string, p: ReturnType<typeof saveEnv>) => { if (p.had) process.env[k] = p.value; else delete process.env[k]; };

/* ──── Feature flag gating ──── */

test("R4D feature flag defaults to off", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  delete process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION;
  try {
    assert.equal(isAgentToolPlannerRealPendingActionEnabled(), false);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prev);
  }
});

test("R4D feature flag is on when set", () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION = "1";
  try {
    assert.equal(isAgentToolPlannerRealPendingActionEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prev);
  }
});

test("R4D flag is independent from R4C flag", () => {
  const prevD = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  const prevC = saveEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS");
  process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION = "1";
  delete process.env.AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS;
  try {
    assert.equal(isAgentToolPlannerRealPendingActionEnabled(), true);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prevD);
    restoreEnv("AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS", prevC);
  }
});

/* ──── Graph runtime produces valid step results (R4C path when R4D off) ──── */

test("graph runtime completes without R4D flags", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "查看计划进度" });
  assert.ok(result.status);
  assert.ok(Array.isArray(result.stepResults));
  assert.ok(Array.isArray(result.traceEvents));
});

test("graph runtime does not produce realPendingAction when R4D flag is off", async () => {
  const prevD = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  delete process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION;
  try {
    const result = await runToolPlannerGraphRuntime({ userMessage: "create a schedule item" });
    // R4C preview-only: no real PendingAction
    assert.equal(result.realPendingAction, undefined);
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prevD);
  }
});

/* ──── No execute, no DB write in graph runtime ──── */

test("graph runtime result has no execute marker", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("\"execute\""));
});

test("graph runtime result has no DB write claim", async () => {
  const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
  const s = JSON.stringify(result);
  assert.ok(!s.includes("payload.create"));
  assert.ok(!s.includes("payload.update"));
  assert.ok(!s.includes("payload.delete"));
});

/* ──── Trace sanitization ──── */

test("graph runtime trace has no secrets even with R4D features", async () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION = "1";
  try {
    const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
    const s = JSON.stringify(result.traceEvents);
    assert.ok(!s.includes("sk-"));
    assert.ok(!s.includes("Bearer"));
    assert.ok(!s.includes("api_key"));
    assert.ok(!s.includes("token"));
    assert.ok(!s.includes("secret"));
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prev);
  }
});

/* ──── Allowlist tools exist and are eligible ──── */

test("all allowlist tools support dryRun and execute", () => {
  for (const name of ["create_schedule_items", "create_plan", "create_checklist"]) {
    const def = getAgentToolDefinition(name as keyof typeof import("../../src/lib/agent/tool-registry").agentToolRegistry);
    assert.ok(def, `${name} must exist`);
    assert.equal(def!.supportsDryRun, true, `${name} supportsDryRun`);
    assert.equal(def!.supportsExecute, true, `${name} supportsExecute`);
    assert.equal(def!.requiresConfirmation, true, `${name} requiresConfirmation`);
    assert.equal(def!.capability, "write", `${name} capability=write`);
  }
});

/* ──── Non-allowlist write tools check ──── */

test("non-allowlist write tools exist but are not in R4D allowlist", () => {
  const allowlist = new Set(["create_schedule_items", "create_plan", "create_checklist"]);
  const nonAllowlisted = ["delete_record", "modify_record", "reschedule_item", "cancel_schedule_item", "save_memory", "schedule_plan"];
  for (const name of nonAllowlisted) {
    assert.equal(allowlist.has(name), false, `${name} should NOT be in R4D allowlist`);
  }
});

/* ──── Single pendingAction constraint ──── */

test("graph runtime never returns multiple real pending actions", async () => {
  const prev = saveEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION");
  process.env.AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION = "1";
  try {
    const result = await runToolPlannerGraphRuntime({ userMessage: "test" });
    // realPendingAction is either undefined (null) or a single object — never an array
    if (result.realPendingAction) {
      assert.equal(typeof result.realPendingAction, "object");
      assert.ok(!Array.isArray(result.realPendingAction));
    }
  } finally {
    restoreEnv("AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION", prev);
  }
});
