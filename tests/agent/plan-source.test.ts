/**
 * R6-C1-E: Legacy plan-source tests updated for heuristic module deletion.
 * parseDefinitionQuestionIntent, parseHeuristicIntent, parseElaborationFollowupIntent
 * are now retired stubs. Tests verify retired behavior.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// R6-C1-E: heuristic modules deleted — stubs only
const parseDefinitionQuestionIntent = (_msg: string) => null;
const parseHeuristicIntent = (_msg: string): { args: Record<string, unknown>; confidence: number; intent: string } => ({ args: {}, confidence: 0, intent: "clarify" });
const parseElaborationFollowupIntent = (_msg: string, _history?: unknown[]) => null;

import { shouldTrustOrchestratorPreResolve } from "../../src/lib/agent/orchestration/plan-source";
import { createClarifyIntent } from "../../src/lib/agent/schemas";
import { resolveOrchestrationPreflightIntent } from "../../src/lib/agent/intent-resolution";

/* ──── Plan-source orchestration tests (unchanged) ──── */

test("shouldTrustOrchestratorPreResolve rejects heuristic clarify fast-path", () => {
  assert.equal(shouldTrustOrchestratorPreResolve(createClarifyIntent("能力介绍"), "heuristic"), false);
});

test("shouldTrustOrchestratorPreResolve accepts llm clarify fast-path", () => {
  assert.equal(shouldTrustOrchestratorPreResolve(createClarifyIntent("需要补充字段"), "llm"), true);
});

/* ──── Retired heuristic parser tests ──── */

test("parseDefinitionQuestionIntent retired — returns null", () => {
  assert.equal(parseDefinitionQuestionIntent("什么是网络安全？"), null);
  assert.equal(parseDefinitionQuestionIntent("什么是农夫山泉？"), null);
  assert.equal(parseDefinitionQuestionIntent("那么什么是CTF呢？"), null);
});

test("parseHeuristicIntent retired — returns clarify", () => {
  const intent = parseHeuristicIntent("什么是网络安全？");
  assert.equal(intent.intent, "clarify");
  assert.equal(intent.confidence, 0);
});

test("parseElaborationFollowupIntent retired — returns null", () => {
  assert.equal(parseElaborationFollowupIntent("CTF"), null);
});
