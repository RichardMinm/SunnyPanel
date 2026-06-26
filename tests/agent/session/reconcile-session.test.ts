/**
 * Post-Router Reconcile — Test Suite
 *
 * Phase 4C: reconcileSessionAfterRoute tests.
 * Validates that final arbitration results correctly update session state.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import { reconcileSessionAfterRoute } from "../../../src/lib/agent/session/reconcile-session";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";

/* ──── Helpers ──── */

type AgentIntentLike = {
  intent: string;
  args?: Record<string, unknown>;
  confidence?: number;
};

const makeIntent = (intent: string, args?: Record<string, unknown>): AgentIntentLike => ({
  intent,
  args,
});

const makeSession = (): AgentSessionState => {
  const s = createDefaultSessionState();
  return s;
};

/* ═══════════════════════════════════════════════════════════════════════
   Test 1: explain → lastTopic=CTF, workflow=learning_explanation
   ═══════════════════════════════════════════════════════════════════════ */

test("explain CTF → lastTopic=CTF, workflow=learning_explanation", () => {
  const session = makeSession();
  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("explain_concept", { topic: "CTF" }),
    userMessage: "什么是CTF",
  });

  assert.equal(result.conversation.lastTopic, "CTF");
  assert.equal(result.conversation.lastUserIntent, "explain_concept");
  assert.equal(result.semantic.domain, "learning");
  assert.equal(result.semantic.stage, "exploring");
  assert.equal(result.semantic.workflow, "learning_explanation");
  assert.equal(result.semantic.currentTarget.entityType, "topic");
  assert.equal(result.semantic.currentTarget.topic, "CTF");
  // lastTransition recorded
  assert.ok(result.lastTransition);
  assert.equal(result.lastTransition!.transitionType, "switch_domain");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 2: expand_answer → preserves last topic
   ═══════════════════════════════════════════════════════════════════════ */

test("expand_answer preserves last topic", () => {
  const session = makeSession();
  session.conversation.lastTopic = "Machine Learning";
  session.semantic.domain = "learning";

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("expand_answer", { topic: "Machine Learning" }),
    userMessage: "更详细一点",
  });

  assert.equal(result.conversation.lastTopic, "Machine Learning");
  assert.equal(result.semantic.domain, "learning");
  assert.equal(result.semantic.workflow, "learning_explanation");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 3: query_schedule overwrites wrong writing_revision session
   ═══════════════════════════════════════════════════════════════════════ */

test("query_schedule overwrites wrong writing_revision session", () => {
  const session = makeSession();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_revision";
  session.semantic.stage = "refining";

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("query_schedule"),
    userMessage: "看看我这周的日程",
  });

  // Schedule query should override the stale writing state
  assert.equal(result.semantic.domain, "schedule");
  assert.equal(result.semantic.stage, "exploring");
  assert.equal(result.semantic.workflow, "schedule_composition");
  // lastTransition should record a domain switch
  assert.equal(result.lastTransition!.transitionType, "switch_domain");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 4: create_writing → writing_creation
   ═══════════════════════════════════════════════════════════════════════ */

test("create_writing → writing_creation", () => {
  const session = makeSession();

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("compose_writing", { title: "My Article" }),
    userMessage: "写一篇文章",
  });

  assert.equal(result.semantic.domain, "writing");
  assert.equal(result.semantic.stage, "drafting");
  assert.equal(result.semantic.workflow, "writing_creation");
  assert.equal(result.semantic.currentTarget.entityType, "writing");
  assert.equal(result.semantic.currentTarget.topic, "My Article");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 5: update_writing → writing_revision
   ═══════════════════════════════════════════════════════════════════════ */

test("update_writing → writing_revision", () => {
  const session = makeSession();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = { entityType: "writing", topic: "Draft" };

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("update_writing", { title: "Draft" }),
    userMessage: "把开头改一下",
  });

  assert.equal(result.semantic.domain, "writing");
  assert.equal(result.semantic.stage, "refining");
  assert.equal(result.semantic.workflow, "writing_revision");
  // currentTarget preserved
  assert.equal(result.semantic.currentTarget.entityType, "writing");
  assert.equal(result.semantic.currentTarget.topic, "Draft");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 6: create_plan → plan_creation
   ═══════════════════════════════════════════════════════════════════════ */

test("create_plan → plan_creation", () => {
  const session = makeSession();

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("compose_plan", { goal: "考研复习计划" }),
    userMessage: "帮我制定考研复习计划",
  });

  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");
  assert.equal(result.semantic.workflow, "plan_creation");
  assert.equal(result.semantic.currentTarget.entityType, "plan");
  assert.equal(result.semantic.currentTarget.topic, "考研复习计划");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 7: update_plan → plan_iteration
   ═══════════════════════════════════════════════════════════════════════ */

test("update_plan → plan_iteration", () => {
  const session = makeSession();
  session.semantic.domain = "planning";
  session.semantic.workflow = "plan_creation";
  session.semantic.currentTarget = { entityType: "plan", topic: "考研复习计划" };

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("update_plan"),
    userMessage: "把数学复习时间调整到上午",
  });

  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "refining");
  assert.equal(result.semantic.workflow, "plan_iteration");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 8: capability does not overwrite currentTarget
   ═══════════════════════════════════════════════════════════════════════ */

test("capability does not overwrite currentTarget", () => {
  const session = makeSession();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = {
    entityType: "writing",
    topic: "Important Article",
  };

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("capability_query"),
    userMessage: "你能做什么",
  });

  // Semantic state preserved for capability queries
  assert.equal(result.semantic.domain, "writing");
  assert.equal(result.semantic.workflow, "writing_creation");
  assert.equal(result.semantic.currentTarget.entityType, "writing");
  assert.equal(result.semantic.currentTarget.topic, "Important Article");
  // Conversation is still tracked
  assert.equal(result.conversation.lastUserIntent, "capability_query");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 9: clarify does not clear session
   ═══════════════════════════════════════════════════════════════════════ */

test("clarify does not clear session", () => {
  const session = makeSession();
  session.semantic.domain = "planning";
  session.semantic.stage = "drafting";
  session.semantic.workflow = "plan_creation";
  session.conversation.lastTopic = "考研计划";

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("clarify", { question: "你希望制定哪个方向的考研计划？" }),
    userMessage: "帮我制定计划",
  });

  // Semantic state preserved
  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");
  assert.equal(result.semantic.workflow, "plan_creation");
  // Conversation tracked
  assert.equal(result.conversation.lastTopic, "考研计划");
  assert.equal(result.conversation.lastUserIntent, "clarify");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 10: pure function, does not mutate input
   ═══════════════════════════════════════════════════════════════════════ */

test("reconcile is pure — does not mutate input session", () => {
  const session = makeSession();
  session.semantic.domain = "general";
  session.semantic.workflow = "none";

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("compose_schedule_item", { title: "Meeting" }),
    userMessage: "安排会议",
  });

  // Input unchanged
  assert.equal(session.semantic.domain, "general");
  assert.equal(session.semantic.workflow, "none");
  // Output is different
  assert.notStrictEqual(result, session);
  assert.equal(result.semantic.domain, "schedule");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 11: natural language confirm does NOT enter executing
   ═══════════════════════════════════════════════════════════════════════ */

test("reconcile never sets stage=executing from natural language", () => {
  const session = makeSession();

  // Test various intents — none should produce executing
  const intents = [
    "explain_concept",
    "compose_schedule_item",
    "compose_writing",
    "compose_plan",
    "clarify",
    "answer_question",
    "capability_query",
    "query_schedule",
  ];

  for (const intent of intents) {
    const result = reconcileSessionAfterRoute({
      session,
      finalIntent: makeIntent(intent),
      userMessage: "test",
    });
    assert.notEqual(
      result.semantic.stage,
      "executing",
      `intent "${intent}" must not produce stage=executing`,
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 12: finalIntent wins over routeHint when they conflict
   ═══════════════════════════════════════════════════════════════════════ */

test("finalIntent wins over conflicting routeHint", () => {
  const session = makeSession();
  // Session was in writing context (routeHint suggested writing_revision)
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_revision";
  session.semantic.stage = "refining";

  // But user says "看看我这周日程" → Router resolves query_schedule
  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("query_schedule"),
    userMessage: "看看我这周日程",
  });

  // Final intent (query_schedule) wins over writing context
  assert.equal(result.semantic.domain, "schedule");
  assert.equal(result.semantic.stage, "exploring");
  assert.equal(result.semantic.workflow, "schedule_composition");
});

/* ═══════════════════════════════════════════════════════════════════════
   Additional: assistantResponseSummary preserved
   ═══════════════════════════════════════════════════════════════════════ */

test("assistantResponseSummary is stored in conversation", () => {
  const session = makeSession();
  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("explain_concept", { topic: "AI" }),
    userMessage: "什么是AI",
    assistantResponseSummary: "Explained the basics of artificial intelligence",
  });

  assert.equal(
    result.conversation.lastAssistantAnswerSummary,
    "Explained the basics of artificial intelligence",
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   Additional: update_writing preserves existing currentTarget
   ═══════════════════════════════════════════════════════════════════════ */

test("update_writing preserves existing entity name in currentTarget", () => {
  const session = makeSession();
  session.semantic.currentTarget = {
    entityType: "writing",
    entityName: "project-report",
    topic: "Project Report",
  };

  const result = reconcileSessionAfterRoute({
    session,
    finalIntent: makeIntent("update_writing"),
    userMessage: "精简第二段",
  });

  assert.equal(result.semantic.currentTarget.entityName, "project-report");
  assert.equal(result.semantic.currentTarget.topic, "Project Report");
});

/* ═══════════════════════════════════════════════════════════════════════
   No LLM / Tool / DB imports
   ═══════════════════════════════════════════════════════════════════════ */

test("reconcile-session does not import LLM / Tool / DB", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(import.meta.dirname ?? __dirname, "../../../src/lib/agent/session/reconcile-session.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /from.*openai|from.*anthropic|from.*complete-structured|from.*llm/i);
  assert.doesNotMatch(source, /from.*executor|from.*tool-gate|from.*dry-run/i);
  assert.doesNotMatch(source, /from.*payload|from.*mongodb|from.*database|from.*persist/i);
});
