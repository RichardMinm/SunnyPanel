import type { ScheduleSlotKey, ScheduleSlots } from "../readiness";
import type { ScheduleSlotExtractionOutput, SlotCandidate } from "./types";
import { ALLOWED_LLM_SLOT_KEYS } from "./types";

export type MergeResult = {
  slots: Partial<ScheduleSlots>;
  source: "deterministic" | "hybrid";
  appliedCandidates: SlotCandidate[];
  ignoredCandidates: SlotCandidate[];
  warnings: string[];
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const slotHasDeterministicValue = (slots: Partial<ScheduleSlots>, key: ScheduleSlotKey): boolean => {
  if (!(key in slots)) return false;

  const value = slots[key];
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return isUsefulString(value);
  if (typeof value === "number") return Number.isFinite(value) && value > 0;

  return true;
};

/* ──── Candidate → ScheduleSlots conversion ──── */

const candidateToSlotValue = (
  candidate: SlotCandidate,
): unknown => {
  const { key, value } = candidate;

  // scheduleGranularity → "day" | "time-block" | "unscheduled"
  if (key === "scheduleGranularity") {
    if (typeof value === "string" && ["day", "time-block", "unscheduled"].includes(value)) {
      return value;
    }
    return undefined;
  }

  // conflictPolicy → "ask" | "skip" | "allow-overlap" | "reschedule"
  if (key === "conflictPolicy") {
    if (typeof value === "string" && ["ask", "skip", "allow-overlap", "reschedule"].includes(value)) {
      return value;
    }
    return undefined;
  }

  // dailyCapacity → string
  if (key === "dailyCapacity") {
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      const minutes = v.minutes;
      const frequency = v.frequency;
      if (typeof frequency === "string" && typeof minutes === "number") {
        const hours = Math.round(minutes / 60 * 10) / 10;
        return `${frequency === "daily" ? "每天" : "每周"} ${hours} 小时`;
      }
      return undefined;
    }
    return undefined;
  }

  // durationEstimate → string
  if (key === "durationEstimate") {
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      if (typeof v.minutes === "number") return `${v.minutes} 分钟`;
    }
    return undefined;
  }

  // availableTimeWindows → ScheduleTimeWindow[]
  if (key === "availableTimeWindows") {
    if (Array.isArray(value)) {
      return value.map((w) => {
        if (typeof w === "object" && w !== null) {
          const win = w as Record<string, unknown>;
          return {
            ...(typeof win.startTime === "string" ? { startTime: win.startTime } : {}),
            ...(typeof win.endTime === "string" ? { endTime: win.endTime } : {}),
            ...(typeof win.day === "string" ? { day: win.day } : {}),
            ...(typeof win.label === "string" ? { day: win.label } : {}),
          };
        }
        return w;
      });
    }
    return undefined;
  }

  // availableDays → string[]
  if (key === "availableDays") {
    if (Array.isArray(value)) return value.filter((d) => typeof d === "string" && d.length > 0);
    if (typeof value === "string" && value.length > 0) return [value];
    return undefined;
  }

  // Fallback for string/number scalar types
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  return value;
};

/* ──── Main merge function ──── */

/**
 * Merge LLM-extracted slot candidates with deterministic slots.
 *
 * Rules:
 * 1. Start with deterministic slots as base.
 * 2. For each validated LLM candidate: if deterministic already has a non-null value
 *    for that key, KEEP deterministic (record warning). Otherwise, fill from LLM.
 * 3. Low-confidence candidates (already filtered by validation) are not present.
 * 4. Result is pure — no side effects, no DB writes.
 * 5. Unsupported keys (not in ALLOWED_LLM_SLOT_KEYS) are ignored.
 *
 * @param deterministic - Slots from regex extractors + session sources
 * @param llmOutput - Validated LLM extraction output (or null)
 */
export const mergeLLMSlots = (
  deterministic: Partial<ScheduleSlots>,
  llmOutput: null | ScheduleSlotExtractionOutput,
): MergeResult => {
  const result: Partial<ScheduleSlots> = { ...deterministic };
  const applied: SlotCandidate[] = [];
  const ignored: SlotCandidate[] = [];
  const warnings: string[] = [...(llmOutput?.warnings ?? [])];

  if (!llmOutput || llmOutput.source === "fallback") {
    return { slots: result, source: "deterministic", appliedCandidates: [], ignoredCandidates: [], warnings };
  }

  for (const candidate of llmOutput.candidates) {
    if (!ALLOWED_LLM_SLOT_KEYS.has(candidate.key)) {
      ignored.push(candidate);
      warnings.push(`Ignored unsupported key: ${candidate.key}`);
      continue;
    }

    // Check if deterministic already has a value for this key
    if (slotHasDeterministicValue(deterministic, candidate.key)) {
      ignored.push(candidate);
      warnings.push(
        `LLM candidate for "${candidate.key}" ignored: deterministic slot already has value.`,
      );
      continue;
    }

    const slotValue = candidateToSlotValue(candidate);
    if (slotValue === undefined) {
      ignored.push(candidate);
      warnings.push(`LLM candidate for "${candidate.key}" could not be converted to slot value.`);
      continue;
    }

    (result as Record<string, unknown>)[candidate.key] = slotValue;
    applied.push(candidate);
  }

  return {
    appliedCandidates: applied,
    ignoredCandidates: ignored,
    slots: result,
    source: applied.length > 0 ? "hybrid" : "deterministic",
    warnings,
  };
};
