import type { ScheduleSlotKey, ScheduleSlots } from "../readiness";

/** Keys that the LLM is allowed to extract. sourceType/sourcePlanId/sourceChecklistId/tasks are excluded. */
export const ALLOWED_LLM_SLOT_KEYS = new Set<ScheduleSlotKey>([
  "availableDays",
  "availableTimeWindows",
  "conflictPolicy",
  "dailyCapacity",
  "deadline",
  "durationEstimate",
  "excludedDates",
  "preferredTime",
  "priorityRule",
  "scheduleGranularity",
]);

export type ScheduleSlotExtractionInput = {
  userMessage: string;
  /** YYYY-MM-DD */
  currentDate: string;
  /** Optional existing slots from session / intent / planning sources */
  existingSlots?: Partial<ScheduleSlots>;
};

export type SlotCandidate<T = unknown> = {
  key: ScheduleSlotKey;
  value: T;
  /** 0–1 */
  confidence: number;
  /** Quote or paraphrase from user message */
  evidence?: string;
  source: "llm";
};

export type ScheduleSlotExtractionOutput = {
  source: "fallback" | "llm";
  confidence: number;
  candidates: SlotCandidate[];
  warnings?: string[];
};

/** Confidence threshold below which candidates are discarded */
export const LLM_CANDIDATE_CONFIDENCE_THRESHOLD = 0.65;

export const VALID_CONFLICT_POLICIES = new Set([
  "ask",
  "allow-overlap",
  "reschedule",
  "skip",
]);
