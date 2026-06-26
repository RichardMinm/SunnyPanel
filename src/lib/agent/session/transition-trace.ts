/**
 * Transition Trace — immutable record of a semantic state transition.
 *
 * Phase 4A of Semantic Session Coordinator v1.
 *
 * Constructs a TransitionTrace object capturing:
 *   - oldSession → transitionOutput → newSession
 *   - routeHint used by downstream Router
 *
 * Constraints:
 *   - Pure function: no DB writes, no Router calls, no Tool calls
 *   - Immutable: does not mutate any input object
 *   - Read-only: this is an audit/tracing artifact, not an execution directive
 */

import type { AgentSessionState, TransitionOutput, TransitionTrace } from "./types";

/* ──── Build ──── */

export const buildTransitionTrace = (
  oldSession: AgentSessionState,
  transitionOutput: TransitionOutput,
  newSession: AgentSessionState,
  routeHint: TransitionOutput["routeHint"],
): TransitionTrace => ({
  oldSession,
  transitionOutput,
  newSession,
  routeHint,
});
