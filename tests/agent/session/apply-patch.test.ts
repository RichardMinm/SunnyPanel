// tests/agent/session/apply-patch.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import type { SessionPatch, TransitionOutput } from "../../../src/lib/agent/session/types";

// Will fail until apply-patch.ts exists
import { applySessionPatch } from "../../../src/lib/agent/session/apply-patch";

const makeTransition = (
  overrides: Partial<TransitionOutput> = {},
): TransitionOutput => ({
  shouldUpdateSession: overrides.shouldUpdateSession ?? true,
  sessionPatch: overrides.sessionPatch ?? {},
  routeHint: overrides.routeHint ?? {
    source: "transition_engine",
    contextualClues: [],
    expectedIntents: [],
    confidence: 0.8,
  },
  transitionType: overrides.transitionType ?? "continue_current_flow",
  reason: overrides.reason ?? "test transition",
});

/* ──── Acceptance Criterion 6: shouldUpdateSession=false → returns same session ──── */

test("shouldUpdateSession=false returns the same session object", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    shouldUpdateSession: false,
    sessionPatch: { domain: "writing", stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.strictEqual(result, session);
  assert.equal(result.semantic.domain, "general"); // unchanged
  assert.equal(result.semantic.stage, "exploring"); // unchanged
});

test("shouldUpdateSession=false ignores patch even with valid data", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "security";
  session.semantic.workflow = "learning_explanation" as const;

  const transition = makeTransition({
    shouldUpdateSession: false,
    sessionPatch: {
      domain: "writing",
      workflow: "writing_creation" as const,
      stage: "refining",
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.strictEqual(result, session);
  assert.equal(result.semantic.domain, "security");               // NOT overwritten
  assert.equal(result.semantic.workflow, "learning_explanation"); // NOT overwritten
  assert.equal(result.semantic.stage, "exploring");               // NOT overwritten
});

/* ──── Acceptance Criterion 7: shouldUpdateSession=true → only updates specified fields ──── */

test("shouldUpdateSession=true with empty patch returns updated clone (updatedAt changed)", () => {
  const session = createDefaultSessionState();
  const originalTime = session.updatedAt;
  const transition = makeTransition({
    shouldUpdateSession: true,
    sessionPatch: {},
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.notStrictEqual(result, session);
  assert.notStrictEqual(result.updatedAt, originalTime);
});

test("patch.domain only updates domain, leaving other semantic fields unchanged", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "security";
  session.semantic.stage = "exploring";
  session.semantic.workflow = "learning_explanation" as const;

  const transition = makeTransition({
    sessionPatch: { domain: "writing" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "writing");                  // updated
  assert.equal(result.semantic.stage, "exploring");                 // unchanged
  assert.equal(result.semantic.workflow, "learning_explanation");   // unchanged
});

test("patch.stage only updates stage", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { stage: "refining" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.stage, "refining");
  assert.equal(result.semantic.domain, "general");   // unchanged
  assert.equal(result.semantic.workflow, "none");    // unchanged
});

test("patch.workflow only updates workflow", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { workflow: "writing_creation" as const },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.workflow, "writing_creation");
  assert.equal(result.semantic.domain, "general");    // unchanged
  assert.equal(result.semantic.stage, "exploring");   // unchanged
});

test("patch updates multiple fields simultaneously", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: {
      domain: "planning",
      stage: "drafting",
      workflow: "plan_creation" as const,
      currentTarget: { topic: "考研计划" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");
  assert.equal(result.semantic.workflow, "plan_creation");
  assert.equal(result.semantic.currentTarget.topic, "考研计划");
});

test("patch.currentTarget merges with existing target", () => {
  const session = createDefaultSessionState();
  session.semantic.currentTarget = {
    entityType: "plan",
    entityName: "健身计划",
    entityId: 42,
    topic: "健身",
  };

  const transition = makeTransition({
    sessionPatch: {
      currentTarget: { topic: "增肌计划" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.currentTarget.topic, "增肌计划");    // updated
  assert.equal(result.semantic.currentTarget.entityType, "plan");   // preserved
  assert.equal(result.semantic.currentTarget.entityName, "健身计划"); // preserved
  assert.equal(result.semantic.currentTarget.entityId, 42);         // preserved
});

test("patch.currentTarget with entityId string", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: {
      currentTarget: { entityId: "mongo_object_id_abc123" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.currentTarget.entityId, "mongo_object_id_abc123");
});

/* ──── Acceptance Criterion 8: domain switch → currentTarget handling ──── */

test("domain switch resets currentTarget when no new topic provided", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = {
    entityType: "article",
    entityName: "我的文章",
  };

  const transition = makeTransition({
    sessionPatch: { domain: "schedule" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "schedule");
  assert.deepStrictEqual(result.semantic.currentTarget, {});
});

test("domain switch with new topic preserves the new topic", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = { entityType: "article", entityName: "我的文章" };

  const transition = makeTransition({
    sessionPatch: {
      domain: "learning",
      currentTarget: { topic: "考研数学" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "learning");
  assert.equal(result.semantic.currentTarget.topic, "考研数学");   // new topic preserved
  assert.equal(result.semantic.currentTarget.entityType, undefined);  // old gone
  assert.equal(result.semantic.currentTarget.entityName, undefined);  // old gone
});

test("same domain does NOT reset currentTarget", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = {
    entityType: "article",
    entityName: "我的文章",
  };

  const transition = makeTransition({
    sessionPatch: { stage: "refining" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "writing");
  assert.equal(result.semantic.currentTarget.entityType, "article");   // preserved
  assert.equal(result.semantic.currentTarget.entityName, "我的文章");  // preserved
});

/* ──── P0-3 guard: executing → confirming ──── */

test("stage=executing coerced to confirming (P0-3 guard)", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { stage: "executing" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.stage, "confirming"); // coerced, not executing
});

/* ──── lastTransition recorded ──── */

test("lastTransition recorded on apply", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  session.semantic.stage = "exploring";

  const transition = makeTransition({
    sessionPatch: { stage: "drafting" },
    transitionType: "deepen_current_flow",
    reason: "用户开始起草计划",
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.ok(result.lastTransition);
  assert.equal(result.lastTransition!.transitionType, "deepen_current_flow");
  assert.equal(result.lastTransition!.reason, "用户开始起草计划");
  assert.equal(result.lastTransition!.fromStage, "exploring");
  assert.equal(result.lastTransition!.toStage, "drafting");
  assert.equal(result.lastTransition!.fromDomain, "general");
  assert.equal(result.lastTransition!.toDomain, "general");
});

test("lastTransition records domain switch", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";

  const transition = makeTransition({
    sessionPatch: { domain: "schedule" },
    transitionType: "switch_domain",
    reason: "用户切换到日程",
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.lastTransition!.fromDomain, "writing");
  assert.equal(result.lastTransition!.toDomain, "schedule");
  assert.equal(result.lastTransition!.transitionType, "switch_domain");
});

/* ──── Immutability ──── */

test("does not mutate the original session", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.stage = "exploring";

  const transition = makeTransition({
    sessionPatch: { domain: "planning", stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.stage, "exploring");
  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");
  assert.notStrictEqual(result, session);
  assert.notStrictEqual(result.semantic, session.semantic);
});

/* ──── updatedAt refreshed ──── */

test("updatedAt refreshed when shouldUpdateSession=true", async () => {
  const session = createDefaultSessionState();
  session.updatedAt = "2020-01-01T00:00:00.000Z";

  await new Promise((r) => setTimeout(r, 5));

  const transition = makeTransition({
    sessionPatch: { stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.notStrictEqual(result.updatedAt, "2020-01-01T00:00:00.000Z");
  assert.ok(new Date(result.updatedAt).getTime() > new Date("2020-01-01").getTime());
});
