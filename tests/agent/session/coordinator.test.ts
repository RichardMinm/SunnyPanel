/**
 * Coordinator — Test Suite
 *
 * Phase 4A: Semantic Session Coordinator integration tests.
 * All tests use mocked LLM calls — no real LLM is invoked.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import {
  runCoordinator,
  type CoordinatorInput,
  type CoordinatorResult,
} from "../../../src/lib/agent/session/coordinator";
import { type TransitionLLMCall } from "../../../src/lib/agent/session/transition-engine";
import { type PendingAction } from "../../../src/lib/agent/session/rule-pre-check";
import { type AgentSessionState } from "../../../src/lib/agent/session/types";

/* ──── Helpers ──── */

let llmCallCount = 0;

const makeLLM = (response: string): TransitionLLMCall => {
  llmCallCount = 0;
  return async () => {
    llmCallCount++;
    return response;
  };
};

const makeValidEngineOutput = () =>
  JSON.stringify({
    shouldUpdateSession: true,
    sessionPatch: {
      domain: "learning",
      stage: "exploring",
    },
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user asked about machine learning"],
      expectedIntents: ["explain_concept"],
      confidence: 0.85,
    },
    transitionType: "switch_domain",
    reason: "User is asking a new learning question",
  });

const makePendingAction = (intent: string): PendingAction => ({
  type: "await_confirmation",
  action: { intent },
  summary: `test action: ${intent}`,
});

const makeInput = (
  overrides: Partial<CoordinatorInput> = {},
): CoordinatorInput => ({
  sessionRaw: undefined,
  message: "Hello",
  history: [],
  pendingAction: null,
  ...overrides,
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule Pre-Check Hit → Skip LLM
   ═══════════════════════════════════════════════════════════════════════ */

test("rulePreCheck hit → does not call LLM", async () => {
  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({
      message: "确认执行",
      pendingAction: makePendingAction("create_plan"),
    }),
    llm,
  );

  // Rule should hit confirm_pending_action
  assert.equal(result.transitionOutput.transitionType, "confirm_pending_action");
  assert.equal(result.routeHint.source, "rule");
  // LLM must NOT have been called
  assert.equal(llmCallCount, 0, "LLM should not be called when rule hits");
});

test("rulePreCheck hit → returns rule routeHint", async () => {
  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({
      message: "算了不做了",
      pendingAction: makePendingAction("delete_schedule"),
    }),
    llm,
  );

  assert.equal(result.transitionOutput.transitionType, "cancel_pending_action");
  assert.equal(result.routeHint.source, "rule");
  assert.equal(llmCallCount, 0);
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule Pre-Check Miss → Call LLM
   ═══════════════════════════════════════════════════════════════════════ */

test("rulePreCheck miss → calls LLM", async () => {
  const llm = makeLLM(makeValidEngineOutput());
  const session = createDefaultSessionState();

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Explain machine learning to me" }),
    llm,
  );

  assert.ok(llmCallCount > 0, "LLM should be called when rule misses");
  assert.equal(result.transitionOutput.transitionType, "switch_domain");
  assert.equal(result.routeHint.source, "transition_engine");
});

/* ═══════════════════════════════════════════════════════════════════════
   LLM Returns Valid Transition → Apply Patch
   ═══════════════════════════════════════════════════════════════════════ */

test("LLM valid transition → apply patch to session", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  session.semantic.stage = "exploring";

  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Explain ML" }),
    llm,
  );

  // Session should be updated with learning domain
  assert.equal(result.newSession.semantic.domain, "learning");
  assert.equal(result.newSession.semantic.stage, "exploring");
  // Old session must be unchanged
  assert.equal(session.semantic.domain, "general");
});

/* ═══════════════════════════════════════════════════════════════════════
   LLM Fallback → Session Unchanged
   ═══════════════════════════════════════════════════════════════════════ */

test("LLM fallback → session unchanged", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";

  // Both attempts return invalid JSON
  const llm: TransitionLLMCall = async () => "invalid {{{";

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Hello" }),
    llm,
  );

  assert.equal(result.transitionOutput.transitionType, "fallback");
  assert.equal(result.routeHint.source, "fallback");
  // Session must be unchanged (domain preserved)
  assert.equal(result.newSession.semantic.domain, "general");
  // Session object should be the normalized version (not cloned again)
  // normalizeSessionState creates a new object; verify domain unchanged
  assert.equal(result.newSession.semantic.stage, "exploring");
});

/* ═══════════════════════════════════════════════════════════════════════
   shouldUpdateSession=false → Session Unchanged
   ═══════════════════════════════════════════════════════════════════════ */

test("shouldUpdateSession=false → session unchanged, patch not applied", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  session.semantic.stage = "exploring";
  session.conversation.lastTopic = "CTF";

  const output = JSON.stringify({
    shouldUpdateSession: false,
    sessionPatch: { domain: "writing", stage: "drafting" },
    routeHint: {
      source: "transition_engine",
      contextualClues: [],
      expectedIntents: [],
      confidence: 0.8,
    },
    transitionType: "deepen_current_flow",
    reason: "User deepens",
  });

  const llm = makeLLM(output);

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "展开说说" }),
    llm,
  );

  assert.equal(result.transitionOutput.shouldUpdateSession, false);
  // Session must be unchanged (shouldUpdateSession=false → no patch applied)
  assert.equal(result.newSession.semantic.domain, "general");
  assert.equal(result.newSession.semantic.stage, "exploring");
  // lastTopic should still be present
  assert.equal(result.newSession.conversation.lastTopic, "CTF");
});

/* ═══════════════════════════════════════════════════════════════════════
   Trace Contains Required Fields
   ═══════════════════════════════════════════════════════════════════════ */

test("trace contains oldSession / transitionOutput / newSession / routeHint", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "planning";
  session.conversation.lastTopic = "Study Plan";

  const llm = makeLLM(
    JSON.stringify({
      shouldUpdateSession: true,
      sessionPatch: { domain: "learning", stage: "drafting" },
      routeHint: {
        source: "transition_engine",
        contextualClues: ["switch to learning"],
        expectedIntents: ["create_plan"],
        confidence: 0.9,
      },
      transitionType: "switch_domain",
      reason: "switching to learning",
    }),
  );

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Create a study plan" }),
    llm,
  );

  const trace = result.trace;
  assert.ok(trace, "trace must exist");
  assert.ok(trace.oldSession, "trace.oldSession must exist");
  assert.ok(trace.transitionOutput, "trace.transitionOutput must exist");
  assert.ok(trace.newSession, "trace.newSession must exist");
  assert.ok(trace.routeHint, "trace.routeHint must exist");

  assert.equal(trace.oldSession.semantic.domain, "planning");
  assert.equal(trace.newSession.semantic.domain, "learning");
  assert.equal(trace.transitionOutput.transitionType, "switch_domain");
  assert.equal(trace.routeHint.source, "transition_engine");
});

/* ═══════════════════════════════════════════════════════════════════════
   Does Not Import Router / Tool Executor / DB
   ═══════════════════════════════════════════════════════════════════════ */

test("coordinator does not import Router / Tool Executor / DB", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/session/coordinator.ts"),
    "utf8",
  );

  // Must not import Router
  assert.doesNotMatch(source, /resolveAgentIntent|arbitrateAgentIntent|resolveRouterChain/i);
  // Must not import Tool Executor
  assert.doesNotMatch(source, /from.*executor|from.*tool-gate|from.*dry-run/i);
  // Must not import DB
  assert.doesNotMatch(source, /from.*payload|from.*mongodb|from.*postgres|from.*database|from.*persist/i);
});

test("transition-trace does not import Router / Tool Executor / DB", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/session/transition-trace.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /resolveAgentIntent|arbitrateAgentIntent|resolveRouterChain/i);
  assert.doesNotMatch(source, /from.*executor|from.*tool-gate|from.*dry-run/i);
  assert.doesNotMatch(source, /from.*payload|from.*mongodb|from.*database|from.*persist/i);
});

/* ═══════════════════════════════════════════════════════════════════════
   Does Not Mutate Input Session
   ═══════════════════════════════════════════════════════════════════════ */

test("coordinator does not mutate input session object", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";

  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Explain ML" }),
    llm,
  );

  // Input session must be unchanged
  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.workflow, "writing_creation");
  // Result must be a different object
  assert.notStrictEqual(result.newSession, session);
});

/* ═══════════════════════════════════════════════════════════════════════
   Normalize Handles Various Input Formats
   ═══════════════════════════════════════════════════════════════════════ */

test("coordinator normalizes null input to default session", async () => {
  // Use a valid engine output that does NOT change domain, to verify normalization
  const noChangeOutput = JSON.stringify({
    shouldUpdateSession: false,
    sessionPatch: {},
    routeHint: {
      source: "transition_engine",
      contextualClues: [],
      expectedIntents: [],
      confidence: 0.5,
    },
    transitionType: "continue_current_flow",
    reason: "no change needed",
  });
  const llm = makeLLM(noChangeOutput);

  const result = await runCoordinator(
    makeInput({ sessionRaw: null, message: "Hello" }),
    llm,
  );

  assert.ok(result.newSession);
  assert.equal(result.newSession.semantic.domain, "general");
  assert.equal(result.newSession.schemaVersion, 1);
});

test("coordinator normalizes undefined input to default session", async () => {
  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({ sessionRaw: undefined, message: "Hello" }),
    llm,
  );

  assert.ok(result.newSession);
  assert.equal(result.newSession.schemaVersion, 1);
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule Hit with shouldUpdateSession=false → session unchanged
   ═══════════════════════════════════════════════════════════════════════ */

test("rule hit deepen → shouldUpdateSession=false → session unchanged", async () => {
  const session = createDefaultSessionState();
  session.conversation.lastTopic = "CTF";

  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "我需要更加详细的信息" }),
    llm,
  );

  // Deepen rule → shouldUpdateSession=false
  assert.equal(result.transitionOutput.shouldUpdateSession, false);
  assert.equal(result.transitionOutput.transitionType, "deepen_current_flow");
  // Session state preserved (shouldUpdateSession=false)
  assert.equal(result.newSession.conversation.lastTopic, "CTF");
  assert.equal(result.newSession.semantic.domain, "general");
  assert.equal(llmCallCount, 0, "LLM should not be called when rule hits");
});

/* ═══════════════════════════════════════════════════════════════════════
   Engine fallback — two invalid attempts — session preserved
   ═══════════════════════════════════════════════════════════════════════ */

test("engine double-invalid → fallback → old session returned unchanged", async () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "planning";

  let calls = 0;
  const llm: TransitionLLMCall = async () => {
    calls++;
    return "not json at all {{{";
  };

  const result = await runCoordinator(
    makeInput({ sessionRaw: session, message: "Test" }),
    llm,
  );

  assert.equal(calls, 2, "should attempt exactly twice");
  assert.equal(result.transitionOutput.transitionType, "fallback");
  // Session domain preserved (fallback → no update)
  assert.equal(result.newSession.semantic.domain, "planning");
});
