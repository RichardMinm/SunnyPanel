/**
 * Intent Safety Signals — deterministic confirmation/cancel/reply detection.
 *
 * R6-C1-D-A-Fix: Extracted from intent/heuristics/replies.ts.
 * R6-C1-E-Fix: Updated to use keyword matching (compatible with original behavior).
 * These are SAFETY GUARDS, not business heuristics.
 */

import type { PendingAction } from "../schemas";

/* ──── Confirmation ──── */

const CONFIRM_KEYWORDS = [
  "确认", "是的", "可以", "好的", "好", "行", "对", "没问题",
  "开始吧", "执行吧", "做吧", "搞吧", "动手吧",
  "确认执行", "可以执行", "确认一下", "可以的", "行吧",
  "好的好的", "嗯嗯", "继续", "同意", "执行",
  // Short keywords (≤2 chars) use exact match, so "执行" won't match "不要执行"
];

export const isConfirmationReply = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.length > 20) return false;
  if (/^(ok|yes|yep|yeah|sure|go ahead|do it|proceed|confirm|continue)\b/.test(trimmed) && trimmed.split(/\s+/).length <= 2) return true;
  return CONFIRM_KEYWORDS.includes(trimmed) || CONFIRM_KEYWORDS.some((kw) => kw.length >= 3 && trimmed.includes(kw));
};

/* ──── Batch Confirmation ──── */

const BATCH_CONFIRM_KEYWORDS = ["全部确认", "确认全部", "都确认", "执行全部", "全部执行"];

export const isBatchConfirmationReply = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase().replace(/\s+/g, "");
  if (/^confirm all|^approve all/i.test(trimmed)) return true;
  // Short confirm phrases (exact match) count as batch confirmation
  return BATCH_CONFIRM_KEYWORDS.some((kw) => trimmed.includes(kw))
    || CONFIRM_KEYWORDS.includes(trimmed); // exact match short confirm
};

/* ──── Cancellation ──── */

const CANCEL_KEYWORDS = [
  "取消", "算了", "不用了", "不要", "不要执行", "取消执行",
  "不执行了", "放弃", "不做了", "先不做", "取消吧", "不搞了",
  "别做了", "停止", "别", "不了", "先别", "先不", "先别执行",
];

export const isCancellationReply = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.length > 15) return false;
  if (/^(cancel|no|nope|stop|abort|never\s*mind)\b/.test(trimmed) && trimmed.split(/\s+/).length <= 2) return true;
  return CANCEL_KEYWORDS.includes(trimmed) || CANCEL_KEYWORDS.some((kw) => kw.length >= 3 && trimmed.includes(kw));
};

/* ──── Negative ──── */

const NEGATIVE_KEYWORDS = ["不用", "不用了", "先不用", "暂时不用", "不需要", "先这样", "不是", "不对", "没有", "不行", "不"];

export const isNegativeReply = (message: string): boolean => {
  const trimmed = message.trim();
  if (trimmed.length > 15) return false;
  return NEGATIVE_KEYWORDS.some((kw) => trimmed.includes(kw));
};

/* ──── Pending Action Skip ──── */

export const shouldSkipPendingAction = (
  _pendingAction: PendingAction | null,
  message: string,
): boolean => isCancellationReply(message) || isNegativeReply(message);
