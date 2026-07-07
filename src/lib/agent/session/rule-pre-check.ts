/**
 * Rule Pre-Check — Semantic Session Coordinator Phase 2
 *
 * R6-C0-B: Split into safety (confirmation-pre-check) and business (business-rule-pre-check).
 * This file is a backward-compatible facade.
 *
 * Deterministic, low-cost rules executed BEFORE the Router / LLM Transition Engine.
 * Captures high-confidence semantic state transitions that don't need an LLM.
 *
 * Constraints:
 * - Pure function: no LLM, no tools, no DB, no side effects
 * - Never mutates the input session object
 * - Returns TransitionOutput on rule hit, null on miss
 * - All routeHint.source values must be "rule"
 */

import type { AgentSessionState, TransitionOutput } from "./types";
import {
  isPendingConfirmMessage,
  isPendingCancelMessage,
  resolveConfirmationPreCheck,
} from "./confirmation-pre-check";
import {
  isDeepenMessage,
  isScheduleQueryMessage,
  isScheduleCreateMessage,
  isWritingRevisionMessage,
  isWritingRevisionContext,
  getCurrentTopic,
  resolveBusinessRulePreCheck,
} from "./business-rule-pre-check";

/* ──── Re-exports ──── */

export {
  // Safety guards (confirmation-pre-check)
  isPendingConfirmMessage,
  isPendingCancelMessage,
  resolveConfirmationPreCheck,
  // Legacy business rules (business-rule-pre-check)
  isDeepenMessage,
  isScheduleQueryMessage,
  isScheduleCreateMessage,
  isWritingRevisionMessage,
  isWritingRevisionContext,
  getCurrentTopic,
  resolveBusinessRulePreCheck,
};

/* ──── Types ──── */

export type PendingAction = {
  type: "await_confirmation";
  action: {
    intent: string;
    [key: string]: unknown;
  };
  summary?: string;
};

export type RulePreCheckInput = {
  session: AgentSessionState;
  message: string;
  pendingAction: PendingAction | null;
};

/* ──── Helpers ──── */

export { normalizeUserMessage } from "./confirmation-pre-check";

export const inferActionFromPendingIntent = (
  intent: string,
): "create" | "update" | "delete" | "cancel" | undefined => {
  const lower = intent.toLowerCase();
  if (/create|compose|add|save/.test(lower)) return "create";
  if (/update|modify|reschedule|append|complete/.test(lower)) return "update";
  if (/delete|remove/.test(lower)) return "delete";
  if (/cancel/.test(lower)) return "cancel";
  return undefined;
};

/* ──── Main ──── */

/**
 * Deterministic rule-based pre-check executed before Router / Transition Engine.
 *
 * R6-C0-B: Delegates to confirmation-pre-check (safety) and business-rule-pre-check (legacy).
 * Priority: safety rules run first.
 */
export const rulePreCheck = (
  input: RulePreCheckInput,
): TransitionOutput | null => {
  // Safety: confirmation/cancel always takes priority
  const confirmationResult = resolveConfirmationPreCheck({
    pendingAction: input.pendingAction,
    message: input.message,
  });
  if (confirmationResult) return confirmationResult;

  // Business rules (legacy — used only in AGENT_REQUIRE_LLM=0 mode)
  return resolveBusinessRulePreCheck({
    session: input.session,
    message: input.message,
  });
};
