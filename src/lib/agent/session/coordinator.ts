/**
 * Semantic Session Coordinator v1 — Phase 4A
 *
 * Orchestrates the full session transition pipeline:
 *   1. normalizeSessionState (sanitize input)
 *   2. rulePreCheck (deterministic, fast)
 *      → hit: use rule output, skip LLM
 *      → miss: run transition engine (LLM)
 *   3. applySessionPatch (if shouldUpdateSession)
 *   4. buildTransitionTrace
 *
 * Constraints:
 *   - Does NOT import Router / intent resolution
 *   - Does NOT import Tool Executor / Tool Gate
 *   - Does NOT import DB / Payload
 *   - Does NOT modify existing Agent behavior
 *   - LLM call is injected for testability
 */

import type { AgentChatMessage } from "../schemas";
import { normalizeSessionState } from "./normalize-session";
import { rulePreCheck, type PendingAction } from "./rule-pre-check";
import {
  runTransitionEngine,
  type TransitionLLMCall,
  type TransitionEngineResult,
} from "./transition-engine";
import { applySessionPatch } from "./apply-patch";
import { buildTransitionTrace } from "./transition-trace";
import type {
  AgentSessionState,
  TransitionOutput,
  TransitionTrace,
  RouteHint,
} from "./types";

/* ──── Coordinator Input / Output ──── */

export type CoordinatorInput = {
  /** Raw session input (may be null, undefined, legacy format, or already typed) */
  sessionRaw: unknown;
  /** Latest user message */
  message: string;
  /** Recent conversation history */
  history: AgentChatMessage[];
  /** Pending action (confirmation/clarification), if any */
  pendingAction: PendingAction | null;
};

export type CoordinatorResult = {
  /** The new (or unchanged) session state after transition */
  newSession: AgentSessionState;
  /** Route hint for the downstream Router */
  routeHint: RouteHint;
  /** Full transition trace for debugging/audit */
  trace: TransitionTrace;
  /** The transition output that was applied (or the fallback) */
  transitionOutput: TransitionOutput;
};

/* ──── Main ──── */

export const runCoordinator = async (
  input: CoordinatorInput,
  llmCall: TransitionLLMCall,
): Promise<CoordinatorResult> => {
  /* ════ Step 1: Normalize ════ */
  const oldSession = normalizeSessionState(input.sessionRaw);

  /* ════ Step 2: Rule Pre-Check ════ */
  const ruleResult = rulePreCheck({
    session: oldSession,
    message: input.message,
    pendingAction: input.pendingAction,
  });

  let transitionOutput: TransitionOutput;
  let engineResult: TransitionEngineResult | null = null;

  if (ruleResult) {
    /* Rule hit — skip LLM */
    transitionOutput = ruleResult;
  } else {
    /* Rule miss — run LLM Transition Engine */
    engineResult = await runTransitionEngine(
      oldSession,
      input.message,
      llmCall,
    );
    transitionOutput = engineResult.output;
  }

  /* ════ Step 3: Apply Patch ════ */
  let newSession: AgentSessionState;

  if (engineResult?.isFallback) {
    /* Transition Engine fallback → keep old session unchanged */
    newSession = oldSession;
  } else if (!transitionOutput.shouldUpdateSession) {
    /* shouldUpdateSession=false → keep old session unchanged */
    newSession = oldSession;
  } else {
    /* shouldUpdateSession=true and not fallback → apply */
    newSession = applySessionPatch(oldSession, transitionOutput.sessionPatch, transitionOutput);
  }

  /* ════ Step 4: Build Trace ════ */
  const trace = buildTransitionTrace(
    oldSession,
    transitionOutput,
    newSession,
    transitionOutput.routeHint,
  );

  return {
    newSession,
    routeHint: transitionOutput.routeHint,
    trace,
    transitionOutput,
  };
};
