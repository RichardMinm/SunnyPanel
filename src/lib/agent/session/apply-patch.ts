import type { AgentSessionState, SessionPatch, TransitionOutput } from "./types";

/**
 * Apply a SessionPatch to an AgentSessionState.
 *
 * Rules:
 * - shouldUpdateSession=false → returns `old` verbatim (same reference).
 * - shouldUpdateSession=true → returns a NEW session with only the
 *   fields specified in `patch` updated; all other fields preserved.
 * - domain switch (patch.domain !== old.semantic.domain) → currentTarget
 *   reset. If the patch also specifies a new currentTarget.topic, that
 *   topic is preserved in the reset target.
 * - stage="executing" → coerced to "confirming" (P0-3 guard).
 * - lastTransition recorded from transition metadata.
 * - updatedAt refreshed to now.
 *
 * PURE FUNCTION — no side effects, no LLM, no Router.
 */
export const applySessionPatch = (
  old: AgentSessionState,
  patch: SessionPatch,
  transition: TransitionOutput,
): AgentSessionState => {
  // P0-1: shouldUpdateSession=false → return same reference
  if (!transition.shouldUpdateSession) {
    return old;
  }

  // Deep clone via structuredClone (available in Node 18+)
  const next = structuredClone(old) as AgentSessionState;
  next.updatedAt = new Date().toISOString();

  // ── domain ──
  const domainChanged =
    patch.domain !== undefined && patch.domain !== old.semantic.domain;

  if (patch.domain !== undefined) {
    next.semantic.domain = patch.domain;
  }

  // ── stage (P0-3 guard) ──
  if (patch.stage !== undefined) {
    next.semantic.stage =
      patch.stage === "executing" ? "confirming" : patch.stage;
  }

  // ── currentTarget ──
  if (patch.currentTarget) {
    if (domainChanged) {
      // Domain switch: reset currentTarget, keep only new topic if provided
      next.semantic.currentTarget = patch.currentTarget.topic
        ? { topic: patch.currentTarget.topic }
        : {};
    } else {
      // Same domain: merge
      next.semantic.currentTarget = {
        ...next.semantic.currentTarget,
        ...patch.currentTarget,
      };
    }
  } else if (domainChanged) {
    // Domain changed but no new currentTarget → reset
    next.semantic.currentTarget = {};
  }

  // ── workflow ──
  if (patch.workflow !== undefined) {
    next.semantic.workflow = patch.workflow;
  }

  // ── lastTransition ──
  next.lastTransition = {
    transitionType: transition.transitionType,
    reason: transition.reason,
    fromStage: old.semantic.stage,
    toStage: next.semantic.stage,
    fromDomain: old.semantic.domain,
    toDomain: next.semantic.domain,
  };

  return next;
};
