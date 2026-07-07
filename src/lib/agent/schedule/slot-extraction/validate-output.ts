import type { ScheduleSlotKey } from "../readiness";
import type { ScheduleSlotExtractionInput, ScheduleSlotExtractionOutput, SlotCandidate } from "./types";
import { ALLOWED_LLM_SLOT_KEYS, LLM_CANDIDATE_CONFIDENCE_THRESHOLD, VALID_CONFLICT_POLICIES } from "./types";

/* ──── Forbidden terms in LLM output ──── */

const FORBIDDEN_TERMS = [
  "sourcePlanId",
  "sourceChecklistId",
  "sourceType",
  "execute",
  "write",
  "pendingAction",
  "payload",
  "dryRun",
  "dry_run",
  "rawPrompt",
  "rawResponse",
  "已写入",
  "已创建",
  "已执行",
];

/* ──── Time format regex ──── */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ──── Validation ──── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isConfidenceValid = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const hasForbiddenTerms = (value: unknown): boolean => {
  const text = typeof value === "string"
    ? value
    : JSON.stringify(value);
  return FORBIDDEN_TERMS.some((term) => text.includes(term));
};

const validateTimeWindow = (window: unknown): boolean => {
  if (!isRecord(window)) return false;

  const startTime = typeof window.startTime === "string" ? window.startTime : null;
  const endTime = typeof window.endTime === "string" ? window.endTime : null;

  if (!startTime || !endTime) return false;
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return false;

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  // startTime must be before endTime
  return (endH! > startH!) || (endH === startH && endM! > startM!);
};

const validateCandidateValue = (candidate: Record<string, unknown>): boolean => {
  const key = String(candidate.key ?? "");

  if (key === "availableTimeWindows") {
    const value = candidate.value;
    if (!Array.isArray(value)) return false;
    return value.every(validateTimeWindow);
  }

  if (key === "conflictPolicy") {
    return typeof candidate.value === "string" && VALID_CONFLICT_POLICIES.has(candidate.value);
  }

  if (key === "dailyCapacity") {
    if (isRecord(candidate.value)) {
      const minutes = (candidate.value as Record<string, unknown>).minutes;
      return typeof minutes === "number" && minutes >= 15 && minutes <= 720;
    }
    return typeof candidate.value === "string" && candidate.value.length > 0;
  }

  if (key === "durationEstimate") {
    if (isRecord(candidate.value)) {
      const minutes = (candidate.value as Record<string, unknown>).minutes;
      return typeof minutes === "number" && minutes >= 15 && minutes <= 720;
    }
    return typeof candidate.value === "string" && candidate.value.length > 0;
  }

  if (key === "deadline") {
    if (typeof candidate.value !== "string") return false;
    // Allow YYYY-MM-DD or relative labels
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate.value)) return true;
    return ["today", "tomorrow", "this_week", "next_week", "this_month"].includes(candidate.value);
  }

  if (key === "scheduleGranularity") {
    return ["day", "time-block", "unscheduled"].includes(String(candidate.value));
  }

  // String/number/array types: allowed as-is with non-empty check
  if (typeof candidate.value === "string") return candidate.value.length > 0;
  if (typeof candidate.value === "number") return true;
  if (Array.isArray(candidate.value)) return candidate.value.length > 0;

  return false;
};

const validateCandidate = (candidate: unknown): candidate is SlotCandidate => {
  if (!isRecord(candidate)) return false;

  const key = candidate.key;
  if (typeof key !== "string" || !ALLOWED_LLM_SLOT_KEYS.has(key as ScheduleSlotKey)) return false;

  const confidence = candidate.confidence;
  if (!isConfidenceValid(confidence)) return false;

  if (!validateCandidateValue(candidate)) return false;

  if (hasForbiddenTerms(candidate)) return false;

  return true;
};

/**
 * Validate LLM slot extraction output.
 * Returns validated output on success, null on validation failure
 * (caller should fallback to deterministic-only extraction).
 */
export const validateSlotExtractionOutput = (
  output: unknown,
  _input: ScheduleSlotExtractionInput,
): ScheduleSlotExtractionOutput | null => {
  if (!isRecord(output)) return null;

  const candidatesRaw = output.candidates;
  if (!Array.isArray(candidatesRaw)) return null;

  const overallConfidence = typeof output.confidence === "number"
    ? output.confidence
    : 0.5;

  // Filter and validate candidates
  const candidates: SlotCandidate[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < candidatesRaw.length; i++) {
    const raw = candidatesRaw[i];
    if (!validateCandidate(raw)) {
      warnings.push(`Candidate ${i} failed validation, skipping.`);
      continue;
    }
    // Filter low-confidence
    if (raw.confidence < LLM_CANDIDATE_CONFIDENCE_THRESHOLD) {
      warnings.push(`Candidate ${raw.key} confidence ${raw.confidence} below threshold, skipping.`);
      continue;
    }
    candidates.push({
      key: raw.key as SlotCandidate["key"],
      value: raw.value,
      confidence: raw.confidence,
      evidence: typeof raw.evidence === "string" ? raw.evidence : undefined,
      source: "llm",
    });
  }

  const sourceWarnings = Array.isArray(output.warnings)
    ? output.warnings.filter((w): w is string => typeof w === "string")
    : [];

  if (hasForbiddenTerms(output)) return null;

  return {
    candidates,
    confidence: Math.max(0, Math.min(1, overallConfidence)),
    source: "llm",
    warnings: [...warnings, ...sourceWarnings],
  };
};
