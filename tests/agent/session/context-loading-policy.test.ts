/**
 * Context Loading Policy v2 — Test Suite
 *
 * Validates:
 *   1. chat/explain/capability → minimal sections
 *   2. query_schedule → schedules section with dateRange
 *   3. create_schedule with dateRange → schedules + correct range
 *   4. writing_revision → content section with targetDocument
 *   5. writing_creation → content section with titles/tags mode
 *   6. planning request → plans + checklists sections
 *   7. composite request → plans + checklists + schedules
 *   8. low confidence → allowSecondPass=true
 *   9. skipped section not interpreted as empty (SectionResult distinction)
 *   10. shadow mode does not change old loading behavior
 *   11. finalIntent contradicts prePolicy → secondPass triggered
 *   12. full/weekly_review → all sections, not unbounded
 */

import assert from "node:assert/strict";
import { test, before, after } from "node:test";

import {
  resolveContextLoadingPolicy,
  resolveSectionsFromIntent,
  getRequiredSectionsForIntent,
  getMissingSectionsForSecondPass,
  mergeSectionsForSecondPass,
  resolveWritingLoadMode,
  getContextLoadingPolicyMode,
  isContextLoadingPolicyEnabled,
  isContextLoadingPolicyShadow,
  PRESETS,
  loadedSection,
  skippedSection,
  type SectionName,
  type SectionResult,
} from "../../../src/lib/agent/context-loading-policy";

/* ──── Helpers ──── */

const hasSection = (sections: SectionName[], name: SectionName): boolean =>
  sections.includes(name);

const notHasSection = (sections: SectionName[], name: SectionName): boolean =>
  !sections.includes(name);

/* ═══════════════════════════════════════════════════════════════════════
   Test 1: chat/explain/capability → minimal sections only
   ═══════════════════════════════════════════════════════════════════════ */

test("chat/explain/capability → minimal sections", () => {
  const chatIntents = ["answer_question", "clarify", "explain_concept", "capability_query", "expand_answer"];
  for (const intent of chatIntents) {
    const sections = resolveSectionsFromIntent(intent);
    assert.deepEqual(sections, PRESETS.minimal, `${intent} should use minimal preset`);
    assert.ok(notHasSection(sections, "plans"), `${intent} should NOT include plans`);
    assert.ok(notHasSection(sections, "schedules"), `${intent} should NOT include schedules`);
    assert.ok(notHasSection(sections, "checklists"), `${intent} should NOT include checklists`);
    assert.ok(notHasSection(sections, "content"), `${intent} should NOT include content`);
    assert.ok(hasSection(sections, "agentRuns"), `${intent} should include agentRuns`);
  }

  /* Policy resolver for typical chat message */
  const policy = resolveContextLoadingPolicy({
    message: "什么是XSS攻击",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("agentRuns"));
  assert.ok(!policy.sections.has("plans"));
  assert.equal(policy.meta.level, "minimal");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 2: query_schedule → schedules section with correct dateRange
   ═══════════════════════════════════════════════════════════════════════ */

test("query_schedule → schedules section with dateRange", () => {
  /* Intent-based */
  const sections = resolveSectionsFromIntent("query_schedule");
  assert.deepEqual(sections, PRESETS.schedule);
  assert.ok(hasSection(sections, "schedules"), "query_schedule should include schedules");

  /* Message-based with date keywords */
  const policy = resolveContextLoadingPolicy({
    message: "看看今天的日程安排",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("schedules"));
  assert.equal(policy.meta.dateRange?.type, "today");
  assert.equal(policy.meta.level, "schedule");

  /* Tomorrow */
  const policy2 = resolveContextLoadingPolicy({
    message: "明天有什么安排",
    workbenchMode: null,
  });
  assert.equal(policy2.meta.dateRange?.type, "tomorrow");

  /* This week */
  const policy3 = resolveContextLoadingPolicy({
    message: "本周日程",
    workbenchMode: null,
  });
  assert.equal(policy3.meta.dateRange?.type, "this_week");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 3: create_schedule → schedules section with dateRange
   ═══════════════════════════════════════════════════════════════════════ */

test("create_schedule → schedules section with dateRange", () => {
  const sections = resolveSectionsFromIntent("create_schedule");
  assert.deepEqual(sections, PRESETS.schedule);

  /* Message with scheduling intent */
  const policy = resolveContextLoadingPolicy({
    message: "下周三下午3点安排一个会议",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("schedules"));
  /* "下周" should trigger next_week */
  assert.equal(policy.meta.dateRange?.type, "next_week");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 4: writing_revision → content section with targetDocument
   ═══════════════════════════════════════════════════════════════════════ */

test("writing_revision → content section with targetDocument", () => {
  const sections = resolveSectionsFromIntent("refine_writing");
  assert.ok(hasSection(sections, "content"), "refine_writing should include content");

  /* Revision mode with currentTarget */
  const mode = resolveWritingLoadMode("refine_writing", {
    entityType: "posts",
    entityId: 42,
  });
  assert.equal(mode.type, "revision");
  if (mode.type === "revision") {
    assert.equal(mode.entityType, "posts");
    assert.equal(mode.entityId, 42);
  }

  /* Policy with session domain=writing */
  const policy = resolveContextLoadingPolicy({
    message: "把开头改一下",
    workbenchMode: null,
    sessionDomain: "writing",
    currentTarget: { entityType: "posts", entityId: 42 },
  });
  assert.ok(policy.sections.has("content"));
  assert.equal(policy.meta.targetDocument?.entityType, "posts");
  assert.equal(policy.meta.targetDocument?.entityId, 42);
  assert.equal(policy.meta.level, "writing");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 5: writing_creation → content section without targetDocument
   ═══════════════════════════════════════════════════════════════════════ */

test("writing_creation → content section in creation mode", () => {
  const sections = resolveSectionsFromIntent("create_writing");
  assert.ok(hasSection(sections, "content"));

  /* Creation mode → no targetDocument */
  const mode = resolveWritingLoadMode("create_writing", null);
  assert.equal(mode.type, "creation");

  /* Policy for writing creation */
  const policy = resolveContextLoadingPolicy({
    message: "帮我写一篇关于AI的文章",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("content"));
  assert.equal(policy.meta.level, "writing");
  assert.equal(policy.meta.targetDocument, undefined);
  assert.ok(policy.meta.allowSecondPass, "writing from keywords should allow second pass");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 6: planning request → plans + checklists sections
   ═══════════════════════════════════════════════════════════════════════ */

test("planning request → plans + checklists sections", () => {
  const planningIntents = ["query_plan", "create_plan", "update_plan", "compose_plan"];
  for (const intent of planningIntents) {
    const sections = resolveSectionsFromIntent(intent);
    assert.ok(hasSection(sections, "plans"), `${intent} should include plans`);
    assert.ok(hasSection(sections, "checklists"), `${intent} should include checklists`);
    assert.ok(notHasSection(sections, "schedules"), `${intent} should NOT include schedules`);
  }

  /* Policy from message */
  const policy = resolveContextLoadingPolicy({
    message: "帮我制定一个考研复习计划",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("plans"));
  assert.equal(policy.meta.level, "planning");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 7: composite request → plans + checklists + schedules
   ═══════════════════════════════════════════════════════════════════════ */

test("composite request → plans + checklists + schedules", () => {
  /* "根据考研计划安排本周复习" → plans + schedules composite */
  const policy = resolveContextLoadingPolicy({
    message: "根据考研计划安排本周复习",
    workbenchMode: null,
  });
  assert.ok(policy.sections.has("plans"), "composite should include plans");
  assert.ok(policy.sections.has("checklists"), "composite should include checklists");
  assert.ok(policy.sections.has("schedules"), "composite should include schedules");
  assert.equal(policy.meta.level, "custom");
  assert.equal(policy.meta.source, "message_keyword");
  assert.equal(policy.meta.reason, "composite: plans + schedules from message keywords");
  /* Composite requests are less certain → allow second pass */
  assert.equal(policy.meta.allowSecondPass, true);
  /* Should detect this_week from "本周" */
  assert.equal(policy.meta.dateRange?.type, "this_week");
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 8: low confidence → allowSecondPass=true
   ═══════════════════════════════════════════════════════════════════════ */

test("low confidence → allowSecondPass=true", () => {
  /* Default (no signal) → low confidence, allow second pass */
  const policy = resolveContextLoadingPolicy({
    message: "你好",
    workbenchMode: null,
  });
  assert.equal(policy.meta.source, "default");
  assert.ok(policy.meta.confidence < 0.6);
  assert.equal(policy.meta.allowSecondPass, true);

  /* Session domain uncertain → allow second pass */
  const policy2 = resolveContextLoadingPolicy({
    message: "随便聊聊",
    workbenchMode: null,
    sessionDomain: "learning",
  });
  /* learning → minimal, low confidence */
  assert.equal(policy2.meta.level, "minimal");
  assert.equal(policy2.meta.allowSecondPass, true);

  /* Pending action → high confidence, no second pass needed */
  const policy3 = resolveContextLoadingPolicy({
    message: "确认",
    workbenchMode: null,
    pendingAction: { type: "await_confirmation", action: { intent: "create_plan" } },
  });
  assert.equal(policy3.meta.source, "pending_action");
  assert.ok(policy3.meta.confidence >= 0.9);
  assert.equal(policy3.meta.allowSecondPass, false);
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 9: skipped section not interpreted as empty
   ═══════════════════════════════════════════════════════════════════════ */

test("SectionResult distinguishes loaded vs skipped", () => {
  /* loaded + empty data → we checked, there are none */
  const loaded: SectionResult<number[]> = loadedSection([]);
  assert.equal(loaded.status, "loaded");
  assert.deepEqual(loaded.data, []);
  /* The consumer knows: status=loaded means "we checked and there are 0" */

  /* skipped + empty data → we didn't check */
  const skipped: SectionResult<number[]> = skippedSection([]);
  assert.equal(skipped.status, "skipped");
  assert.deepEqual(skipped.data, []);
  /* The consumer knows: status=skipped means "don't assume anything" */

  /* The two should NOT be treated the same */
  assert.notEqual(loaded.status, skipped.status);
});

test("minimal preset does not include plans — plans are skipped, not empty", () => {
  const sections = resolveSectionsFromIntent("answer_question");
  /* Plans should NOT be in the section set at all */
  assert.ok(!sections.includes("plans"), "minimal preset must NOT load plans");

  /* Policy for chat → plans are skipped */
  const policy = resolveContextLoadingPolicy({
    message: "解释一下量子计算",
    workbenchMode: null,
  });
  assert.ok(!policy.sections.has("plans"));
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 10: shadow mode does not change behavior
   ═══════════════════════════════════════════════════════════════════════ */

test("AGENT_CONTEXT_LOADING_POLICY default is off (not shadow)", () => {
  const original = process.env.AGENT_CONTEXT_LOADING_POLICY;

  try {
    delete process.env.AGENT_CONTEXT_LOADING_POLICY;
    assert.equal(getContextLoadingPolicyMode(), "off");
    assert.equal(isContextLoadingPolicyEnabled(), false);
    assert.equal(isContextLoadingPolicyShadow(), false);
  } finally {
    if (original !== undefined) {
      process.env.AGENT_CONTEXT_LOADING_POLICY = original;
    } else {
      delete process.env.AGENT_CONTEXT_LOADING_POLICY;
    }
  }
});

test("AGENT_CONTEXT_LOADING_POLICY=shadow → shadow mode, not enabled", () => {
  const original = process.env.AGENT_CONTEXT_LOADING_POLICY;

  try {
    process.env.AGENT_CONTEXT_LOADING_POLICY = "shadow";
    assert.equal(getContextLoadingPolicyMode(), "shadow");
    assert.equal(isContextLoadingPolicyEnabled(), false); // NOT enabled for selective load
    assert.equal(isContextLoadingPolicyShadow(), true);
  } finally {
    if (original !== undefined) {
      process.env.AGENT_CONTEXT_LOADING_POLICY = original;
    } else {
      delete process.env.AGENT_CONTEXT_LOADING_POLICY;
    }
  }
});

test("AGENT_CONTEXT_LOADING_POLICY=1 → enabled", () => {
  const original = process.env.AGENT_CONTEXT_LOADING_POLICY;

  try {
    process.env.AGENT_CONTEXT_LOADING_POLICY = "1";
    assert.equal(getContextLoadingPolicyMode(), "on");
    assert.equal(isContextLoadingPolicyEnabled(), true);
    assert.equal(isContextLoadingPolicyShadow(), false);
  } finally {
    if (original !== undefined) {
      process.env.AGENT_CONTEXT_LOADING_POLICY = original;
    } else {
      delete process.env.AGENT_CONTEXT_LOADING_POLICY;
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 11: finalIntent contradicts prePolicy → secondPass triggered
   ═══════════════════════════════════════════════════════════════════════ */

test("missing sections detected for second pass", () => {
  /* Pre-policy loaded minimal (no schedules), Router returns query_schedule */
  const loadedSections = new Set<SectionName>(["user", "agentRuns", "memory"]);
  const requiredSections = getRequiredSectionsForIntent("query_schedule");
  /* query_schedule requires: user, agentRuns, memory, schedules */
  assert.ok(requiredSections.has("schedules"));

  const missing = getMissingSectionsForSecondPass(requiredSections, loadedSections);
  assert.deepEqual(missing, ["schedules"]);
});

test("merge sections for second pass adds missing sections", () => {
  const original = new Set<SectionName>(["user", "agentRuns", "memory"]);
  const missing: SectionName[] = ["schedules"];
  const merged = mergeSectionsForSecondPass(original, missing);

  assert.ok(merged.has("schedules"));
  assert.ok(merged.has("user"));
  assert.equal(merged.size, 4); // original 3 + 1 new
});

test("no missing sections → no second pass", () => {
  const loadedSections = new Set<SectionName>(["user", "agentRuns", "memory", "schedules"]);
  const requiredSections = getRequiredSectionsForIntent("query_schedule");
  const missing = getMissingSectionsForSecondPass(requiredSections, loadedSections);
  assert.equal(missing.length, 0);
});

/* ═══════════════════════════════════════════════════════════════════════
   Test 12: full/weekly_review → all sections
   ═══════════════════════════════════════════════════════════════════════ */

test("full/weekly_review → all sections", () => {
  const sections = resolveSectionsFromIntent("weekly_review");
  assert.deepEqual(sections, PRESETS.full);
  assert.ok(sections.includes("plans"));
  assert.ok(sections.includes("checklists"));
  assert.ok(sections.includes("content"));
  assert.ok(sections.includes("timeline"));
  assert.ok(sections.includes("schedules"));

  /* Policy from message */
  const policy = resolveContextLoadingPolicy({
    message: "帮我做本周的周报总结",
    workbenchMode: null,
  });
  assert.equal(policy.meta.level, "full");
  assert.ok(policy.sections.has("timeline"));
  assert.ok(policy.sections.has("schedules"));
});

test("summarize_progress → full sections", () => {
  const sections = resolveSectionsFromIntent("summarize_progress");
  assert.deepEqual(sections, PRESETS.full);
});

/* ═══════════════════════════════════════════════════════════════════════
   Additional: workbenchMode signal strength
   ═══════════════════════════════════════════════════════════════════════ */

test("workbench mode overrides message keywords", () => {
  /* Message says "schedule" but workbench says "writing" */
  const policy = resolveContextLoadingPolicy({
    message: "查看日程",
    workbenchMode: "writing",
  });
  /* workbench mode takes priority (source #2 vs message keyword #3) */
  assert.equal(policy.meta.source, "workbench");
  assert.equal(policy.meta.level, "writing");
  assert.equal(policy.meta.confidence, 0.9);
});

test("pendingAction has highest priority", () => {
  const policy = resolveContextLoadingPolicy({
    message: "你好",
    workbenchMode: "writing",
    pendingAction: { type: "await_confirmation", action: { intent: "create_schedule" } },
  });
  assert.equal(policy.meta.source, "pending_action");
  assert.equal(policy.meta.level, "schedule");
  assert.equal(policy.meta.confidence, 0.95);
});

/* ═══════════════════════════════════════════════════════════════════════
   Additional: lastIntent carry-over
   ═══════════════════════════════════════════════════════════════════════ */

test("lastIntent carries over to non-minimal level", () => {
  const policy = resolveContextLoadingPolicy({
    message: "继续",
    workbenchMode: null,
    lastIntent: "compose_plan",
  });
  assert.equal(policy.meta.source, "last_intent");
  assert.equal(policy.meta.level, "planning");
  assert.equal(policy.meta.allowSecondPass, true); // carry-over is uncertain
});

test("lastIntent=answer_question stays minimal", () => {
  const policy = resolveContextLoadingPolicy({
    message: "然后呢",
    workbenchMode: null,
    lastIntent: "answer_question",
  });
  /* answer_question → minimal, no carry-over to higher level */
  assert.equal(policy.meta.level, "minimal");
});

/* ═══════════════════════════════════════════════════════════════════════
   Additional: unknown intent → safe default
   ═══════════════════════════════════════════════════════════════════════ */

test("unknown intent defaults to minimal", () => {
  const sections = resolveSectionsFromIntent("some_unknown_intent");
  assert.deepEqual(sections, PRESETS.minimal);
});

test("session_domain=schedule → schedule level", () => {
  const policy = resolveContextLoadingPolicy({
    message: "还有什么",
    workbenchMode: null,
    sessionDomain: "schedule",
  });
  assert.equal(policy.meta.source, "session_state");
  assert.equal(policy.meta.level, "schedule");
  assert.equal(policy.meta.confidence, 0.5);
  assert.equal(policy.meta.allowSecondPass, true);
});
