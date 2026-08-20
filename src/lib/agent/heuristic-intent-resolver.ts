/**
 * R6-C1: LEGACY SHELL — retired heuristic intent resolver.
 *
 * Previously re-exported business heuristic functions from intent/heuristics/index.
 * Since R6-C1-E, those 13 files are physically deleted.
 *
 * Current state (R6-Final):
 *  - Re-exports safety functions from intent-safety-signals (confirmation detection).
 *  - Provides retired stubs for business functions (always return null/empty).
 *  - Still imported by intent/arbitration.ts while deterministic safety helpers
 *    are being separated from its historical arbitration contract.
 *
 * R6-Final status: keep-as-legacy-compat. The safety re-exports are active;
 * the business stubs are no-ops.
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

/* These stubs preserve the deterministic arbitration contract while the
 * retired business heuristic implementation remains unavailable. */

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
