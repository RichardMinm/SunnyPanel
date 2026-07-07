/**
 * Confirmation Pre-Check — Deterministic Safety Rules.
 *
 * Extracted from rule-pre-check.ts (R6-C0-B).
 * Rules 1-2: Pending Confirmation Confirm / Cancel.
 *
 * These are SAFETY GUARDS, not business heuristics.
 * They remain active in both AGENT_REQUIRE_LLM=1 and AGENT_REQUIRE_LLM=0 modes.
 *
 * Pure functions: no LLM, no tools, no DB, no side effects.
 */

import type { TransitionOutput } from "./types";

/* ──── Types ──── */

export type PendingAction = {
  type: "await_confirmation";
  action: {
    intent: string;
    [key: string]: unknown;
  };
  summary?: string;
};

export type ConfirmationPreCheckInput = {
  pendingAction: PendingAction | null;
  message: string;
};

/* ──── Text Normalization ──── */

export const normalizeUserMessage = (message: string): string =>
  message.trim().replace(/\s+/g, " ").toLowerCase();

/* ──── Confirm Messages ──── */

const CONFIRM_MESSAGES = new Set([
  "确认", "确认执行", "可以", "可以执行", "没问题", "好的", "好", "行",
  "对", "是的", "开始吧", "执行吧", "做吧", "ok", "yes", "y", "是",
  "确认一下", "可以的", "行吧", "好的好的", "嗯嗯", "搞吧", "动手吧",
]);

export const isPendingConfirmMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);
  if (CONFIRM_MESSAGES.has(normalized)) return true;
  if (/^(ok|yes|yep|yeah|sure|go ahead|do it|proceed|confirm|continue)\b/.test(normalized)) {
    if (normalized.split(/\s+/).length <= 2) return true;
  }
  if (normalized.length <= 6) {
    if (/^(可以|好的|是的|确认|没问题|行|对|开始|执行|做|搞|弄|干)/.test(normalized)) return true;
  }
  return false;
};

/* ──── Cancel Messages ──── */

const CANCEL_MESSAGES = new Set([
  "取消", "算了", "不用了", "不要", "别做了", "停止", "放弃", "不了",
  "先不做", "cancel", "no", "n", "别", "不做了", "不用", "算了算了",
  "停", "先不", "先别",
]);

export const isPendingCancelMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);
  if (CANCEL_MESSAGES.has(normalized)) return true;
  if (normalized.length <= 6) {
    if (/^(取消|算了|不用|不要|别|停止|放弃|不了|不搞|不做|先不)/.test(normalized)) return true;
  }
  if (/^(cancel|no|nope|stop|abort|never\s*mind)\b/.test(normalized)) {
    if (normalized.split(/\s+/).length <= 2) return true;
  }
  return false;
};

/* ──── Output Builders ──── */

const buildPendingConfirmOutput = (pendingAction: PendingAction): TransitionOutput => {
  const summary = pendingAction.summary ?? pendingAction.action.intent;
  return {
    shouldUpdateSession: true,
    sessionPatch: { stage: "confirming" },
    transitionType: "confirm_pending_action",
    routeHint: {
      source: "rule",
      expectedIntents: [pendingAction.action.intent],
      contextualClues: [`用户确认了 pending action: ${summary}`],
      confidence: 0.98,
    },
    reason: `规则前置：用户确认了待处理动作「${summary}」`,
  };
};

const buildPendingCancelOutput = (pendingAction: PendingAction): TransitionOutput => {
  const summary = pendingAction.summary ?? pendingAction.action.intent;
  return {
    shouldUpdateSession: true,
    sessionPatch: { stage: "exploring", workflow: "none" },
    transitionType: "cancel_pending_action",
    routeHint: {
      source: "rule",
      contextualClues: ["用户取消了 pending action"],
      expectedIntents: [],
      confidence: 0.98,
    },
    reason: `规则前置：用户取消了待处理动作「${summary}」`,
  };
};

/* ──── Main ──── */

/**
 * Confirmation safety pre-check: confirm or cancel pending actions.
 *
 * Returns TransitionOutput on match, null if message is not a confirm/cancel.
 */
export const resolveConfirmationPreCheck = (
  input: ConfirmationPreCheckInput,
): TransitionOutput | null => {
  const { message, pendingAction } = input;
  const normalized = normalizeUserMessage(message);
  if (!normalized) return null;

  if (
    pendingAction?.type === "await_confirmation" &&
    isPendingConfirmMessage(message)
  ) {
    return buildPendingConfirmOutput(pendingAction);
  }

  if (
    pendingAction?.type === "await_confirmation" &&
    isPendingCancelMessage(message)
  ) {
    return buildPendingCancelOutput(pendingAction);
  }

  return null;
};
