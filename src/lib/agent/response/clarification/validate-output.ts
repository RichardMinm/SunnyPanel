import type { ClarificationComposerInput, ClarificationComposerOutput } from "./types";

/* ──── Forbidden internal field names ──── */

const FORBIDDEN_TERMS = [
  "sourceType",
  "missingSlots",
  "knownSlots",
  "conflictPolicy",
  "priorityRule",
  "availableTimeWindows",
  "dailyCapacity",
  "plan_creation",
  "schedule_creation",
  "currentProgress",
  "successCriteria",
  "deliverables",
  "constraints",
  "availableTime",
  "availableDays",
  "excludedDates",
  "durationEstimate",
  "scheduleGranularity",
  "sourcePlanId",
  "sourceChecklistId",
  "sourceType",
  "SLOT_LABELS",
  "slot",
  "slots",
];

/* ──── Forbidden write-commitment phrases ──── */

const FORBIDDEN_WRITE_PHRASES = [
  "已写入",
  "已创建日程",
  "已创建计划",
  "已保存",
  "我已经帮你安排",
  "我已经帮你创建",
  "我已经创建",
  "已经写入",
  "已经创建",
  "已经保存",
  "已安排",
  "已帮你安排",
  "已生成并保存",
  "已直接创建",
  "已执行",
  "写入完成",
  "创建完成",
  "保存完成",
];

/* ──── Required safety signals ──── */

const REQUIRED_SAFETY_SIGNALS = [
  "不直接写入",
  "暂时不会写入",
  "不会直接保存",
  "还不会创建",
  "不会写入",
  "先生成草案",
  "先给你草案",
  "先给你一版草案",
  "不写入",
];

/**
 * Validate a clarification composer output.
 * Returns the validated output on success, null if validation fails
 * (caller should fallback).
 */
export const validateClarificationOutput = (
  output: unknown,
  input: ClarificationComposerInput,
): ClarificationComposerOutput | null => {
  if (!output || typeof output !== "object") return null;

  const obj = output as Record<string, unknown>;

  /* ── message must exist ── */
  const message = typeof obj.message === "string" ? obj.message.trim() : "";
  if (!message) return null;

  /* ── questions must be array ── */
  const questions = Array.isArray(obj.questions)
    ? obj.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : [];
  if (questions.length > input.maxQuestions) return null;

  /* ── safetyNote must exist ── */
  const safetyNote = typeof obj.safetyNote === "string" ? obj.safetyNote.trim() : "";
  if (!safetyNote) return null;

  /* ── suggestedReply ── */
  const suggestedReply = typeof obj.suggestedReply === "string" && obj.suggestedReply.trim()
    ? obj.suggestedReply.trim()
    : undefined;

  /* ── source ── */
  const source = obj.source === "llm" ? "llm" as const : "fallback" as const;

  /* ── Check for forbidden internal field names in output ── */
  const combinedText = `${message} ${questions.join(" ")} ${safetyNote} ${suggestedReply ?? ""}`;
  for (const term of FORBIDDEN_TERMS) {
    if (combinedText.includes(term)) return null;
  }

  /* ── Check for forbidden write-commitment phrases ── */
  for (const phrase of FORBIDDEN_WRITE_PHRASES) {
    if (combinedText.includes(phrase)) return null;
  }

  /* ── Check for required safety signal ── */
  const hasSafetySignal = REQUIRED_SAFETY_SIGNALS.some((signal) => combinedText.includes(signal));
  if (!hasSafetySignal) return null;

  return {
    message,
    questions,
    safetyNote,
    source,
    ...(suggestedReply ? { suggestedReply } : {}),
  };
};
