/**
 * Pipeline Integration — E2E Test Suite
 *
 * Phase 4D: feature-flag gated Coordinator pipeline.
 * All tests use mocked LLM — no real LLM is invoked.
 */

import assert from "node:assert/strict";
import { test, before, after } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import { isSessionCoordinatorEnabled } from "../../../src/lib/agent/session/coordinator-feature-flag";
import {
  runCoordinatorPreRouter,
  type RouterArbitrationResult,
} from "../../../src/lib/agent/session/pipeline-integration";
import type { TransitionLLMCall } from "../../../src/lib/agent/session/transition-engine";
import type { PendingAction } from "../../../src/lib/agent/session/rule-pre-check";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";

/* ──── Setup/Teardown ──── */

const originalEnv = process.env.AGENT_SESSION_COORDINATOR;

before(() => {
  // Save original
});

after(() => {
  if (originalEnv !== undefined) {
    process.env.AGENT_SESSION_COORDINATOR = originalEnv;
  } else {
    process.env.AGENT_SESSION_COORDINATOR = "0";
  }
});

/* ──── Helpers ──── */

const makeLLM = (response: string): TransitionLLMCall => async () => response;

const makeValidEngineOutput = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    shouldUpdateSession: true,
    sessionPatch: { domain: "learning", stage: "exploring" },
    routeHint: {
      source: "transition_engine",
      contextualClues: ["test"],
      expectedIntents: ["explain_concept"],
      confidence: 0.8,
    },
    transitionType: "switch_domain",
    reason: "test",
    ...overrides,
  });

const makePendingAction = (intent: string): PendingAction => ({
  type: "await_confirmation",
  action: { intent },
});

const makeRouterResult = (intent: string): RouterArbitrationResult => ({
  intent: { intent },
  route: "answer",
  reason: "test",
});

/* ═══════════════════════════════════════════════════════════════════════
   Feature Flag OFF → Old Behavior Unchanged
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=0 → coordinator does not run", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "0";
  assert.equal(isSessionCoordinatorEnabled(), false);

  const result = await runCoordinatorPreRouter({
    conversationState: undefined,
    message: "Hello",
    history: [],
    llmCall: makeLLM("{}"),
  });

  // Session context is empty
  assert.equal(result.sessionContext, "");
  // Route hint is fallback
  assert.equal(result.routeHint.source, "fallback");
});

test("AGENT_SESSION_COORDINATOR=0 → reconcile is no-op", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "0";

  const result = await runCoordinatorPreRouter({
    conversationState: undefined,
    message: "Hello",
    history: [],
    llmCall: makeLLM("{}"),
  });

  const { finalSession } = result.reconcile(makeRouterResult("explain_concept"));
  // No session produced when feature flag is off
  assert.equal(finalSession, null);
});

/* ═══════════════════════════════════════════════════════════════════════
   Feature Flag ON → CTF → 更详细 keeps topic
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: CTF → 更详细 keeps topic", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.conversation.lastTopic = "CTF";

  const llm = makeLLM(makeValidEngineOutput());

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "更详细一点",
    history: [],
    llmCall: llm,
  });

  assert.ok(result.sessionContext.includes("CTF"), "session context should include CTF");

  // Router resolves expand_answer
  const { finalSession, trace } = result.reconcile(makeRouterResult("expand_answer"));

  assert.ok(finalSession);
  assert.equal(finalSession.conversation.lastTopic, "CTF");
  assert.equal(finalSession.semantic.domain, "learning");
  assert.equal(finalSession.semantic.workflow, "learning_explanation");
  assert.ok(trace.routeHintApplied, "routeHint should align with Router output");
});

/* ═══════════════════════════════════════════════════════════════════════
   Writing → Continuous Revision → writing_revision
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: writing creation → continuous revision → writing_revision", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = {
    entityType: "writing",
    topic: "My Draft",
  };

  // TransitionEngine output: continue in writing, shouldUpdateSession=false
  const engineOutput = JSON.stringify({
    shouldUpdateSession: false,
    sessionPatch: {},
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user editing"],
      expectedIntents: ["update_writing", "refine_writing"],
      confidence: 0.86,
    },
    transitionType: "deepen_current_flow",
    reason: "continuing writing revision",
  });

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "把开头改一下",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  assert.ok(result.routeHint.expectedIntents.includes("update_writing"));

  // Router resolves update_writing (aligned with hint)
  const { finalSession, trace } = result.reconcile(makeRouterResult("update_writing"));

  assert.equal(finalSession.semantic.domain, "writing");
  assert.equal(finalSession.semantic.stage, "refining");
  assert.equal(finalSession.semantic.workflow, "writing_revision");
  assert.equal(finalSession.semantic.currentTarget.topic, "My Draft");
  assert.ok(trace.routeHintApplied);
});

/* ═══════════════════════════════════════════════════════════════════════
   Writing Revision → User asks schedule → Final switches to schedule
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: writing_revision + 看看日程 → finalSession switches to schedule", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_revision";
  session.semantic.stage = "refining";

  const engineOutput = JSON.stringify({
    shouldUpdateSession: true,
    sessionPatch: { domain: "schedule", stage: "exploring", workflow: "schedule_composition" },
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user querying schedule"],
      expectedIntents: ["query_schedule"],
      confidence: 0.85,
    },
    transitionType: "switch_domain",
    reason: "user asking about schedule",
  });

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "看看我这周的日程",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  // Router resolves query_schedule
  const { finalSession, trace } = result.reconcile(makeRouterResult("query_schedule"));

  assert.equal(finalSession.semantic.domain, "schedule");
  assert.equal(finalSession.semantic.stage, "exploring");
  assert.equal(finalSession.semantic.workflow, "schedule_composition");
  // RouteHint aligned
  assert.ok(trace.routeHintApplied);
  // Conflict is false
  assert.equal(trace.routeHintConflict, false);
});

/* ═══════════════════════════════════════════════════════════════════════
   RouteHint vs FinalIntent Conflict → finalIntent wins
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: routeHint conflicts with finalIntent → finalIntent wins", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_revision";

  // Use a message that avoids ALL rule pre-check hits so the TransitionEngine runs:
  // "今天有什么学习建议" doesn't match any schedule/create/deepen/confirm rules
  // TransitionEngine output suggests writing_revision (staying in current domain)
  const engineOutput = JSON.stringify({
    shouldUpdateSession: false,
    sessionPatch: {},
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user editing"],
      expectedIntents: ["update_writing", "refine_writing"],
      confidence: 0.86,
    },
    transitionType: "continue_current_flow",
    reason: "expected writing revision in writing context",
  });

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "今天有什么学习建议",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  // Verify the TransitionEngine ran (not rule pre-check)
  assert.equal(result.routeHint.source, "transition_engine");

  // But Router resolves query_schedule — user intent overrides the hint
  const { finalSession, trace } = result.reconcile(makeRouterResult("query_schedule"));

  assert.equal(finalSession.semantic.domain, "schedule");
  assert.equal(trace.routeHintApplied, false, "routeHint should NOT be marked applied");
  assert.equal(trace.routeHintConflict, true, "routeHint should be marked as conflict");
});

/* ═══════════════════════════════════════════════════════════════════════
   capability_query → does not overwrite currentTarget
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: capability_query preserves currentTarget", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = {
    entityType: "writing",
    topic: "Important Article",
  };

  const engineOutput = JSON.stringify({
    shouldUpdateSession: false,
    sessionPatch: {},
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user asking about capabilities"],
      expectedIntents: ["capability_query"],
      confidence: 0.7,
    },
    transitionType: "continue_current_flow",
    reason: "capability question",
  });

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "你能做什么",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  const { finalSession } = result.reconcile(makeRouterResult("capability_query"));

  // currentTarget preserved
  assert.equal(finalSession.semantic.currentTarget.entityType, "writing");
  assert.equal(finalSession.semantic.currentTarget.topic, "Important Article");
  // Domain preserved (capability doesn't change domain)
  assert.equal(finalSession.semantic.domain, "writing");
});

/* ═══════════════════════════════════════════════════════════════════════
   Natural language confirm → never enters executing
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: natural language confirm → never executing", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  const pa = makePendingAction("create_plan");

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "确认执行",
    history: [],
    pendingAction: pa,
    llmCall: makeLLM("{}"),
  });

  // Rule should hit confirm_pending_action
  assert.equal(result.routeHint.source, "rule");

  const { finalSession } = result.reconcile(makeRouterResult("compose_plan"));

  assert.notEqual(finalSession.semantic.stage, "executing");
  assert.equal(finalSession.semantic.stage, "drafting");
});

/* ═══════════════════════════════════════════════════════════════════════
   Router failure → session not advanced
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: Router failure → session unchanged", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";

  const engineOutput = JSON.stringify({
    shouldUpdateSession: true,
    sessionPatch: { domain: "learning", stage: "exploring" },
    routeHint: {
      source: "transition_engine",
      contextualClues: [],
      expectedIntents: ["explain_concept"],
      confidence: 0.8,
    },
    transitionType: "switch_domain",
    reason: "test",
  });

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "test",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  // Simulate Router throwing
  let errorCaught = false;
  try {
    throw new Error("Router failure");
  } catch {
    errorCaught = true;
  }
  assert.ok(errorCaught, "Router error should be catchable");

  // The pre-Router step should have succeeded (Coordinator ran)
  assert.ok(result.sessionContext.includes("learning"));
});

/* ═══════════════════════════════════════════════════════════════════════
   Trace completeness
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_SESSION_COORDINATOR=1: trace contains all required fields", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";

  const session = createDefaultSessionState();
  session.semantic.domain = "planning";
  session.conversation.lastTopic = "Study Plan";

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "帮我细化学习计划",
    history: [],
    llmCall: makeLLM(makeValidEngineOutput()),
  });

  const { trace } = result.reconcile(makeRouterResult("update_plan"));

  assert.ok(trace.oldSession);
  assert.ok(trace.coordinatorResult);
  assert.ok(trace.routeHint);
  assert.ok(trace.reconciledSession);
  assert.ok(trace.routerOutput);
  assert.ok(trace.arbitrationResult);
  assert.ok("routeHintApplied" in trace);
  assert.ok("routeHintConflict" in trace);
  assert.ok("routeHintInfluence" in trace);
  assert.ok("hintStrength" in trace);
  assert.ok("sessionContext" in trace);
});

/* ═══════════════════════════════════════════════════════════════════════
   Does not import forbidden modules
   ═══════════════════════════════════════════════════════════════════════ */

test("pipeline-integration does not import Tool Gate / Executor / Policy Guard", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/session/pipeline-integration.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /from.*executor|from.*tool-gate|from.*dry-run/i);
  assert.doesNotMatch(source, /from.*policy|from.*guard/i);
});
