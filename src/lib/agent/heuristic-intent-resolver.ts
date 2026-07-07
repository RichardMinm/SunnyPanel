/**
 * R6-C1: LEGACY SHELL — retired heuristic intent resolver.
 *
 * Previously re-exported business heuristic functions from intent/heuristics/index.
 * Since R6-C1-E, those 13 files are physically deleted.
 *
 * Current state (R6-Final):
 *  - Re-exports safety functions from intent-safety-signals (confirmation detection).
 *  - Provides retired stubs for business functions (always return null/empty).
 *  - Still imported by intent/arbitration.ts for backward type compatibility.
 *
 * R6-Final status: keep-as-legacy-compat. The safety re-exports are active;
 * the business stubs are no-ops. Full removal requires arbitration.ts refactor
 * (deferred to post-R6).
 *
 * Does NOT import from: intent/heuristics/index, intent/heuristics/*
 */

import type { AgentIntent } from "./schemas";

// R6-C1-D-A-Fix: Safety signals from new non-heuristic file
export {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  shouldSkipPendingAction,
} from "./intent/intent-safety-signals";

/* ──── Retired business heuristic stubs ──── */

/* These stubs exist only to keep intent-resolution.ts (resolveAgentIntent)
 * compiling. resolveAgentIntent has been retired from the production path
 * since R6-C1-B. The stubs return safe no-op values. */

export const cleanupText = (text: string): string => text.trim();

export const extractConsultationTopic = (_message: string): string | null => null;

export const inferMemoryType = (_content: string) => "fact" as const;

export const isGeneralConsultationQuestion = (_message: string): boolean => false;

export const isLearningAdviceQuestion = (_message: string): boolean => false;

export const isMathTwoSyllabusQuestion = (_message: string): boolean => false;

export const isNewCommand = (_message: string): boolean => false;

export const parseKnowledgeAnswerIntent = (_message: string): AgentIntent | null => null;

// parseHeuristicIntent — RETIRED. NOT exported.
// Previously used by orchestrator.ts (retired in R6-C1-D-A).