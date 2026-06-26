/**
 * Pipeline Integration — Phase 4D
 *
 * Encapsulates the full Session Coordinator flow for embedding into the
 * existing Agent chat pipeline.
 *
 * When AGENT_SESSION_COORDINATOR=1:
 *   1. normalizeSessionState from conversationState
 *   2. runCoordinator (rulePreCheck → TransitionEngine if needed)
 *   3. Inject sessionContext + routeHint into Router
 *   4. After Router/Arbitration → reconcileSessionAfterRoute
 *   5. Return finalSession + trace for persistence
 *
 * When AGENT_SESSION_COORDINATOR=0:
 *   Returns null → existing pipeline behavior unchanged
 *
 * Constraints:
 *   - Does not modify Tool Gate / Executor / Policy Guard
 *   - Does not persist before Router/Arbitration completes
 *   - Does not set stage=executing from natural language
 *   - On Router/Arbitration failure, does not advance session
 */

import { isSessionCoordinatorEnabled } from "./coordinator-feature-flag";
import { normalizeSessionState } from "./normalize-session";
import { runCoordinator, type CoordinatorInput, type CoordinatorResult } from "./coordinator";
import { buildRouterSessionContext } from "./router-context";
import { reconcileSessionAfterRoute } from "./reconcile-session";
import type { TransitionLLMCall } from "./transition-engine";
import type { AgentSessionState, RouteHint, TransitionTrace } from "./types";
import type { PendingAction } from "./rule-pre-check";
import type { AgentChatMessage } from "../schemas";

/* ──── Types ──── */

/** Input for the full coordinator-integrated pipeline step. */
export type CoordinatorPipelineInput = {
  conversationState?: unknown;
  message: string;
  history: AgentChatMessage[];
  pendingAction?: PendingAction | null;
  /** Inject LLM call for Transition Engine (mock in tests, real in production) */
  llmCall: TransitionLLMCall;
};

/** Router/Arbitration mock interface — what comes back after routing. */
export type RouterArbitrationResult = {
  intent: { intent: string; args?: Record<string, unknown>; confidence?: number };
  route?: string;
  reason?: string;
};

/** Complete trace from a coordinator-integrated turn. */
export type CoordinatorTurnTrace = {
  oldSession: AgentSessionState;
  coordinatorResult: CoordinatorResult;
  sessionContext: string;
  routeHint: RouteHint;
  /** Hint strength classification */
  hintStrength: "strong_hint" | "weak_hint" | "background";
  /** Whether the routeHint was consistent with the final arbitration */
  routeHintApplied: boolean;
  routeHintConflict: boolean;
  /** The influence the routeHint had */
  routeHintInfluence: "strong_hint" | "weak_hint" | "background" | "none";
  /** After-reconcile final session */
  reconciledSession: AgentSessionState;
  routerOutput?: RouterArbitrationResult;
  arbitrationResult?: RouterArbitrationResult;
  coordinatorError?: string;
};

/** Result of running the coordinator pipeline step. */
export type CoordinatorPipelineResult = {
  /** The sessionContext block to inject into Router prompt */
  sessionContext: string;
  /** RouteHint for the Router */
  routeHint: RouteHint;
  /** Full turn trace for debugging */
  trace: CoordinatorTurnTrace;
  /**
   * Post-route reconcile function.
   * Call this AFTER Router/Arbitration produces finalIntent.
   * Returns the reconciled session ready for persistence.
   */
  reconcile: (finalResult: RouterArbitrationResult) => {
    finalSession: AgentSessionState;
    trace: CoordinatorTurnTrace;
  };
};

/** Null result when feature flag is off */
const NULL_RESULT: CoordinatorPipelineResult = {
  sessionContext: "",
  routeHint: { source: "fallback", contextualClues: [], expectedIntents: [], confidence: 0 },
  trace: null as unknown as CoordinatorTurnTrace,
  reconcile: () => ({ finalSession: null as unknown as AgentSessionState, trace: null as unknown as CoordinatorTurnTrace }),
};

/* ──── Main ──── */

/**
 * Run the coordinator pipeline pre-Router step.
 *
 * Call this BEFORE resolveAgentIntent / resolveUnifiedIntent.
 * Pass the returned sessionContext to the Router.
 * After Router returns finalIntent, call result.reconcile(finalResult).
 */
export const runCoordinatorPreRouter = async (
  input: CoordinatorPipelineInput,
): Promise<CoordinatorPipelineResult> => {
  /* Feature flag OFF → no-op */
  if (!isSessionCoordinatorEnabled()) {
    return NULL_RESULT;
  }

  try {
    /* Step 1: Normalize */
    const oldSession = normalizeSessionState(input.conversationState);

    /* Step 2: Run Coordinator (rulePreCheck → maybe TransitionEngine) */
    const coordinatorResult = await runCoordinator(
      {
        sessionRaw: oldSession,
        message: input.message,
        history: input.history,
        pendingAction: input.pendingAction ?? null,
      },
      input.llmCall,
    );

    /* Step 3: Build session context for Router injection */
    const sessionContext = buildRouterSessionContext(
      coordinatorResult.newSession,
      coordinatorResult.routeHint,
    );

    /* Classify hint strength */
    const hintStrength = classifyHint(coordinatorResult.routeHint);

    /* Build trace (pre-reconcile) */
    const baseTrace: CoordinatorTurnTrace = {
      oldSession,
      coordinatorResult,
      sessionContext,
      routeHint: coordinatorResult.routeHint,
      hintStrength,
      routeHintApplied: false,
      routeHintConflict: false,
      routeHintInfluence: hintStrength === "background" ? "none" : hintStrength,
      reconciledSession: oldSession, // placeholder, filled by reconcile
    };

    /* Return the context + a reconcile closure */
    return {
      sessionContext,
      routeHint: coordinatorResult.routeHint,
      trace: baseTrace,
      reconcile: (finalResult: RouterArbitrationResult) => {
        /* Step 4: Reconcile after Router/Arbitration */
        let reconciledSession: AgentSessionState;
        let coordinatorError: string | undefined;

        try {
          reconciledSession = reconcileSessionAfterRoute({
            session: coordinatorResult.newSession,
            finalIntent: finalResult.intent as { intent: string; args?: Record<string, unknown> },
            userMessage: input.message,
          });

          /* Check hint alignment */
          const routeHintApplied = checkHintApplied(
            coordinatorResult.routeHint,
            finalResult,
          );

          baseTrace.reconciledSession = reconciledSession;
          baseTrace.routerOutput = finalResult;
          baseTrace.arbitrationResult = finalResult;
          baseTrace.routeHintApplied = routeHintApplied;
          baseTrace.routeHintConflict = !routeHintApplied;
          baseTrace.routeHintInfluence = hintStrength;

          return { finalSession: reconciledSession, trace: baseTrace };
        } catch (err) {
          /* Router/Arbitration failure → do NOT advance session */
          coordinatorError = err instanceof Error ? err.message : String(err);
          baseTrace.coordinatorError = coordinatorError;
          baseTrace.reconciledSession = coordinatorResult.newSession;
          baseTrace.routeHintApplied = false;
          baseTrace.routeHintConflict = true;

          return { finalSession: coordinatorResult.newSession, trace: baseTrace };
        }
      },
    };
  } catch (err) {
    /* Coordinator itself failed → null result, pipeline falls back */
    return NULL_RESULT;
  }
};

/* ──── Helpers ──── */

const classifyHint = (hint: RouteHint): CoordinatorTurnTrace["hintStrength"] => {
  if (hint.source === "fallback") return "background";
  if (hint.confidence < 0.6) return "background";
  if (hint.confidence >= 0.85) return "strong_hint";
  return "weak_hint";
};

const checkHintApplied = (
  hint: RouteHint,
  result: RouterArbitrationResult,
): boolean => {
  if (hint.source === "fallback") return false;
  if (hint.confidence < 0.6) return false;
  if (hint.expectedIntents.length === 0) return false;

  const finalIntent = result.intent.intent;
  return hint.expectedIntents.includes(finalIntent);
};
