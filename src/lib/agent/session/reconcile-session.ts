/**
 * Post-Router Reconcile — Phase 4C
 *
 * After the Router / Arbitration produces a final AgentIntent, this pure function
 * updates the AgentSessionState to reflect the actual routing outcome.
 *
 * This prevents session drift: the Coordinator predicts a transition, but the
 * Router + Arbitration may produce a different result. Reconcile aligns the
 * session with reality BEFORE the next turn.
 *
 * Safety:
 *   - Pure function: no LLM, no tools, no DB, no side effects
 *   - Never sets stage="executing" (only UI confirmation / backend token can)
 *   - Never mutates input session object
 *   - When RouteHint conflicts with finalIntent, finalIntent wins
 */

import type { AgentSessionState, DialogueStage, SemanticDomain, WorkflowId } from "./types";

/* ──── Intent extraction helpers ──── */

type AgentIntentLike = {
  intent: string;
  args?: Record<string, unknown>;
  confidence?: number;
  reply?: string;
};

/** Try to extract a topic/title/entity name from intent args. */
const extractTopic = (intent: AgentIntentLike): string | null => {
  const args = intent.args;
  if (!args) return null;

  // Common topic fields across intent types
  const topic = asString(args.topic)
    ?? asString(args.title)
    ?? asString(args.goal)
    ?? asString(args.subject)
    ?? asString(args.entityName)
    ?? asString(args.summary);

  if (topic && topic.length <= 200) return topic;
  return null;
};

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/* ──── Intent classification ──── */

const LEARNING_INTENTS = new Set([
  "explain_concept", "expand_answer", "give_examples",
  "compare_concepts", "give_learning_path", "rewrite_answer",
  "summarize_answer",
]);

const SCHEDULE_QUERY_INTENTS = new Set([
  "query_schedule", "query_timeline",
]);

const SCHEDULE_CREATE_INTENTS = new Set([
  "compose_schedule_item", "create_schedule_item",
  "reschedule_item", "compose_timeline_event",
]);

const WRITING_CREATE_INTENTS = new Set([
  "compose_writing", "create_writing",
]);

const WRITING_UPDATE_INTENTS = new Set([
  "update_writing", "refine_writing", "writing_revision",
  "rewrite_answer",
]);

const PLAN_CREATE_INTENTS = new Set([
  "compose_plan", "create_plan",
]);

const PLAN_UPDATE_INTENTS = new Set([
  "update_plan", "modify_plan", "append_plan_item",
  "complete_plan_item", "schedule_plan",
]);

const CAPABILITY_INTENTS = new Set([
  "capability_query", "capability", "chat",
]);

const CLARIFY_INTENT = "clarify";

/* ──── Main ──── */

export type ReconcileInput = {
  session: AgentSessionState;
  finalIntent: AgentIntentLike;
  userMessage: string;
  assistantResponseSummary?: string;
  toolResultSummary?: string;
};

export const reconcileSessionAfterRoute = (
  input: ReconcileInput,
): AgentSessionState => {
  const { session, finalIntent, assistantResponseSummary } = input;

  // Deep clone — never mutate the input
  const next = structuredClone(session) as AgentSessionState;
  next.updatedAt = new Date().toISOString();

  const intent = finalIntent.intent;
  const topic = extractTopic(finalIntent);
  const oldDomain = session.semantic.domain;
  const oldStage = session.semantic.stage;

  // Always update conversation tracking
  next.conversation.lastUserIntent = intent;
  if (topic) next.conversation.lastTopic = topic;
  if (assistantResponseSummary) {
    next.conversation.lastAssistantAnswerSummary = assistantResponseSummary;
  }

  /* ── Rule 1: explain / expand_answer ── */
  if (LEARNING_INTENTS.has(intent)) {
    next.semantic.domain = "learning";
    next.semantic.stage = "exploring";
    next.semantic.workflow = "learning_explanation";
    if (topic) {
      next.semantic.currentTarget = {
        entityType: "topic",
        topic,
      };
    }
    recordTransition(next, oldDomain, "learning", oldStage, "exploring", intent);
    return next;
  }

  /* ── Rule 2: schedule query ── */
  if (SCHEDULE_QUERY_INTENTS.has(intent)) {
    next.semantic.domain = "schedule";
    next.semantic.stage = "exploring";
    next.semantic.workflow = "schedule_composition";
    recordTransition(next, oldDomain, "schedule", oldStage, "exploring", intent);
    return next;
  }

  /* ── Rule 3: schedule create ── */
  if (SCHEDULE_CREATE_INTENTS.has(intent)) {
    next.semantic.domain = "schedule";
    next.semantic.stage = "drafting";
    next.semantic.workflow = "schedule_composition";
    if (topic) {
      next.semantic.currentTarget = {
        entityType: "schedule",
        topic,
      };
    }
    recordTransition(next, oldDomain, "schedule", oldStage, "drafting", intent);
    return next;
  }

  /* ── Rule 4: writing create ── */
  if (WRITING_CREATE_INTENTS.has(intent)) {
    next.semantic.domain = "writing";
    next.semantic.stage = "drafting";
    next.semantic.workflow = "writing_creation";
    next.semantic.currentTarget = {
      entityType: "writing",
      ...(topic ? { topic } : {}),
    };
    recordTransition(next, oldDomain, "writing", oldStage, "drafting", intent);
    return next;
  }

  /* ── Rule 5: writing update ── */
  if (WRITING_UPDATE_INTENTS.has(intent)) {
    next.semantic.domain = "writing";
    next.semantic.stage = "refining";
    next.semantic.workflow = "writing_revision";
    // Preserve currentTarget from old session (don't overwrite)
    recordTransition(next, oldDomain, "writing", oldStage, "refining", intent);
    return next;
  }

  /* ── Rule 6: plan create ── */
  if (PLAN_CREATE_INTENTS.has(intent)) {
    next.semantic.domain = "planning";
    next.semantic.stage = "drafting";
    next.semantic.workflow = "plan_creation";
    if (topic) {
      next.semantic.currentTarget = {
        entityType: "plan",
        topic,
      };
    }
    recordTransition(next, oldDomain, "planning", oldStage, "drafting", intent);
    return next;
  }

  /* ── Rule 7: plan update ── */
  if (PLAN_UPDATE_INTENTS.has(intent)) {
    next.semantic.domain = "planning";
    next.semantic.stage = "refining";
    next.semantic.workflow = "plan_iteration";
    recordTransition(next, oldDomain, "planning", oldStage, "refining", intent);
    return next;
  }

  /* ── Rule 8: summarize / review / answer ── */
  if (intent === "summarize" || intent === "answer_question" ||
      intent === "evaluate_plan" || intent === "query_plan_progress" ||
      intent === "query_progress") {
    next.semantic.stage = "reviewing";
    next.semantic.workflow = intent.includes("weekly") || intent.includes("review")
      ? "weekly_review" as WorkflowId
      : "general_query" as WorkflowId;
    recordTransition(next, oldDomain, next.semantic.domain, oldStage, "reviewing", intent);
    return next;
  }

  /* ── Rule 9: capability / chat — don't overwrite currentTarget ── */
  if (CAPABILITY_INTENTS.has(intent) || intent === "answer_question") {
    // Only update conversation tracking, keep semantic fields
    // No domain/stage/workflow change
    return next;
  }

  /* ── Rule 10: clarify — keep stage, don't force executing ── */
  if (intent === CLARIFY_INTENT) {
    // Keep current semantic state, only record conversation
    // NEVER set stage="executing" from clarify
    return next;
  }

  /* ── Default: unknown intent — keep semantic state ── */
  return next;
};

/* ──── Helpers ──── */

const recordTransition = (
  next: AgentSessionState,
  fromDomain: SemanticDomain,
  toDomain: SemanticDomain,
  fromStage: DialogueStage,
  toStage: DialogueStage,
  intent: string,
) => {
  const domainChanged = fromDomain !== toDomain;
  next.lastTransition = {
    transitionType: domainChanged ? "switch_domain" : "continue_current_flow",
    reason: `Router resolved intent "${intent}" → domain: ${toDomain}, stage: ${toStage}`,
    fromStage,
    toStage,
    ...(domainChanged ? { fromDomain, toDomain } : {}),
  };
};
