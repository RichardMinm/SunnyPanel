/**
 * Phase R6-C1-D-A: Legacy Heuristic Import Consumers Retired Tests.
 *
 * Verifies:
 *  1. heuristic-intent-resolver no longer exports parseHeuristicIntent
 *  2. orchestrator no longer imports parseHeuristicIntent
 *  3. Safety functions (confirmation/cancel) still exported
 *  4. Confirmation path still works
 *  5. No pendingAction / execute / DB write in retired paths
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmationMatchesPending,
  resolveConfirmationSignals,
  restoreConfirmedIntent,
} from "../../../src/lib/agent/chat-pipeline/confirmation-step";
import {
  parseProposedAgentAction,
  type PendingAction,
} from "../../../src/lib/agent/schemas";

/* ═══════════════════════════════════════════════════════════════
   1. parseHeuristicIntent REMOVED from re-export layer
   ═══════════════════════════════════════════════════════════════ */

test("heuristic-intent-resolver does NOT export parseHeuristicIntent", async () => {
  const mod = await import("../../../src/lib/agent/heuristic-intent-resolver");
  assert.equal("parseHeuristicIntent" in mod, false,
    "parseHeuristicIntent must NOT be exported from heuristic-intent-resolver");
});

/* ═══════════════════════════════════════════════════════════════
   2. Safety functions STILL exported
   ═══════════════════════════════════════════════════════════════ */

test("heuristic-intent-resolver still exports confirmation safety functions", async () => {
  const mod = await import("../../../src/lib/agent/heuristic-intent-resolver");
  assert.ok(typeof mod.isConfirmationReply === "function");
  assert.ok(typeof mod.isCancellationReply === "function");
  assert.ok(typeof mod.isNegativeReply === "function");
  assert.ok(typeof mod.shouldSkipPendingAction === "function");
  assert.ok(typeof mod.isBatchConfirmationReply === "function");
});

/* ═══════════════════════════════════════════════════════════════
   3. orchestrator no longer imports parseHeuristicIntent
   ═══════════════════════════════════════════════════════════════ */

test("Legacy Orchestrator implementation is removed", async () => {
  const { existsSync } = await import("node:fs");
  assert.equal(
    existsSync("src/lib/agent/orchestration/orchestrator.ts"),
    false,
  );
});

/* ═══════════════════════════════════════════════════════════════
   4. legacy-heuristic-resolution-step still exists (NOT deleted)
   ═══════════════════════════════════════════════════════════════ */

test("legacy-heuristic-resolution-step is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step");
  assert.ok(typeof mod.resolveLegacyHeuristicStep === "function");
});

test("confirmation-resolution-step is still importable", async () => {
  const mod = await import("../../../src/lib/agent/chat-pipeline/confirmation-resolution-step");
  assert.ok(typeof mod.resolveConfirmationStep === "function");
});

/* ═══════════════════════════════════════════════════════════════
   5. Controlled retired response still works
   ═══════════════════════════════════════════════════════════════ */

test("buildLegacyHeuristicRetiredResponse is importable", async () => {
  const mod = await import("../../../src/lib/agent/tool-planner/unavailable-response");
  assert.ok(typeof mod.buildLegacyHeuristicRetiredResponse === "function");
  const response = mod.buildLegacyHeuristicRetiredResponse({ threadId: 1 });
  assert.equal(response.pendingAction, null);
});

/* ═══════════════════════════════════════════════════════════════
   6. Confirmation safety preserved
   ═══════════════════════════════════════════════════════════════ */

test("existing pendingAction + confirm → confirm signal true", () => {
  const action = parseProposedAgentAction({
    id: "r6c1da-confirm-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "创建计划",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "R6-C1-D-A" },
  })!;
  const pa: PendingAction = { action, type: "await_confirmation" };
  const signals = resolveConfirmationSignals({
    confirmation: { actionId: "r6c1da-confirm-001", type: "confirm" },
    message: "确认",
    pendingAction: pa,
  });
  assert.equal(signals.confirm, true);
});

test("confirmationMatchesPending still matches", () => {
  const action = parseProposedAgentAction({
    id: "r6c1da-match-001",
    intent: "create_checklist",
    riskLevel: "medium",
    summary: "匹配测试",
    changes: [{ collection: "checklists", operation: "create", preview: "测试" }],
    args: { title: "测试" },
  })!;
  const pa = { action, type: "await_confirmation" } as Extract<PendingAction, { type: "await_confirmation" }>;
  assert.equal(confirmationMatchesPending(pa, { actionId: "r6c1da-match-001", type: "confirm" }), true);
});

test("restoreConfirmedIntent still works", () => {
  const action = parseProposedAgentAction({
    id: "r6c1da-restore-001",
    intent: "create_plan",
    riskLevel: "medium",
    summary: "恢复测试",
    changes: [{ collection: "plans", operation: "create", preview: "测试" }],
    args: { title: "恢复测试" },
  })!;
  const intent = restoreConfirmedIntent(action);
  assert.ok(intent);
  assert.equal(intent.intent, "create_plan");
});

/* ═══════════════════════════════════════════════════════════════
   7. Import chain verification
   ═══════════════════════════════════════════════════════════════ */

test("heuristic-intent-resolver does NOT import from intent/heuristics", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("src/lib/agent/heuristic-intent-resolver.ts", "utf-8");
  // Must contain the safety import from new file
  assert.ok(content.includes("intent-safety-signals"), "should import from intent-safety-signals");
  // Must NOT import from intent/heuristics (except in comments)
  const importLines = content.split("\n").filter((l) => /^\s*import\s+.*from\s+["'][^"']*heuristics/.test(l));
  assert.equal(importLines.length, 0, `heuristic-intent-resolver must not import from heuristics: ${importLines.join("; ")}`);
});

test("legacy-heuristic-resolution-step does NOT import resolveAgentIntent", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts", "utf-8");
  const importLines = content.split("\n").filter((l) => l.includes("import") && l.includes("resolveAgentIntent") && !l.includes("//") && !l.includes("*"));
  assert.equal(importLines.length, 0, "legacy step must not import resolveAgentIntent");
});

test("intent-safety-signals does NOT import from heuristic modules", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync("src/lib/agent/intent/intent-safety-signals.ts", "utf-8");
  const importLines = content.split("\n").filter((l) => /^\s*import\s+.*from\s+["'][^"']*heuristics/.test(l));
  assert.equal(importLines.length, 0, `intent-safety-signals must not import heuristic modules: ${importLines.join("; ")}`);
});
