import { z } from "zod";

import { ALLOWED_LLM_SLOT_KEY_VALUES } from "./slot-extraction/types";

const confidenceSchema = z.number().finite().min(0).max(1);
const usefulTextSchema = z.string().trim().min(1).max(500);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isCalendarDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
};

const candidateMetadataShape = {
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(500).optional(),
};

const timeWindowSchema = z.object({
  day: usefulTextSchema.optional(),
  endTime: timeSchema,
  label: usefulTextSchema.optional(),
  startTime: timeSchema,
}).strict();

const durationObjectSchema = z.object({
  minutes: z.number().int().min(15).max(720),
}).strict();

const capacityObjectSchema = z.object({
  frequency: z.enum(["daily", "weekly"]),
  minutes: z.number().int().min(15).max(720),
}).strict();

const slotCandidateSchema = z.discriminatedUnion("key", [
  z.object({
    ...candidateMetadataShape,
    key: z.literal("availableDays"),
    value: z.array(usefulTextSchema).min(1).max(31),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("availableTimeWindows"),
    value: z.array(timeWindowSchema).min(1).max(31),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("conflictPolicy"),
    value: z.enum(["ask", "allow-overlap", "reschedule", "skip"]),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("dailyCapacity"),
    value: z.union([usefulTextSchema, capacityObjectSchema]),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("deadline"),
    value: z.union([
      isoDateSchema,
      z.enum(["today", "tomorrow", "this_week", "next_week", "this_month"]),
    ]),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("durationEstimate"),
    value: z.union([usefulTextSchema, durationObjectSchema]),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("excludedDates"),
    value: z.array(isoDateSchema).min(1).max(31),
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("preferredTime"),
    value: usefulTextSchema,
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("priorityRule"),
    value: usefulTextSchema,
  }).strict(),
  z.object({
    ...candidateMetadataShape,
    key: z.literal("scheduleGranularity"),
    value: z.enum(["day", "time-block", "unscheduled"]),
  }).strict(),
]);

const scheduleSlotExtractionShape = {
  candidates: z.array(slotCandidateSchema).max(20),
  confidence: confidenceSchema,
  warnings: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
};

export const scheduleSlotExtractionBaseSchema = z.object(
  scheduleSlotExtractionShape,
);

export const scheduleSlotExtractionSchema = z.object(
  scheduleSlotExtractionShape,
).strict().superRefine((value, context) => {
  for (const [candidateIndex, candidate] of value.candidates.entries()) {
    if (
      candidate.key === "deadline"
      && /^\d{4}-\d{2}-\d{2}$/.test(candidate.value)
      && !isCalendarDate(candidate.value)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "deadline must be a real calendar date",
        path: ["candidates", candidateIndex, "value"],
      });
    }
    if (
      candidate.key === "excludedDates"
      && candidate.value.some((date) => !isCalendarDate(date))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "excludedDates must contain real calendar dates",
        path: ["candidates", candidateIndex, "value"],
      });
    }
    if (candidate.key !== "availableTimeWindows") continue;

    for (const [windowIndex, window] of candidate.value.entries()) {
      if (window.startTime >= window.endTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startTime must be before endTime",
          path: ["candidates", candidateIndex, "value", windowIndex, "endTime"],
        });
      }
    }
  }
});

export const SCHEDULE_SLOT_EXTRACTION_TOP_LEVEL_FIELDS = Object.freeze(
  scheduleSlotExtractionBaseSchema.keyof().options,
);

export const SCHEDULE_SLOT_CANDIDATE_FIELDS = Object.freeze([
  "key",
  ...Object.keys(candidateMetadataShape),
  "value",
] as const);

export const SCHEDULE_SLOT_KEY_ALLOWLIST = Object.freeze(
  [...ALLOWED_LLM_SLOT_KEY_VALUES],
);

const parsedScheduleTimeShape = {
  confidence: confidenceSchema,
  date: isoDateSchema.nullable(),
  durationMinutes: z.number().int().min(15).max(720),
  endTime: timeSchema.nullable(),
  isAllDay: z.boolean(),
  startTime: timeSchema.nullable(),
};

export const parsedScheduleTimeBaseSchema = z.object(parsedScheduleTimeShape);

export const parsedScheduleTimeSchema = z.object(parsedScheduleTimeShape)
  .strict()
  .superRefine((value, context) => {
    if (value.date !== null && !isCalendarDate(value.date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date must be a real calendar date",
        path: ["date"],
      });
    }
    if (value.isAllDay) {
      if (value.startTime !== null || value.endTime !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "all-day results must not contain startTime or endTime",
          path: ["isAllDay"],
        });
      }
      return;
    }

    if ((value.startTime === null) !== (value.endTime === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTime and endTime must both be null or both be present",
        path: [value.startTime === null ? "startTime" : "endTime"],
      });
    }

    if (value.startTime !== null && value.endTime !== null && value.startTime >= value.endTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTime must be before endTime",
        path: ["endTime"],
      });
    }
  });

export const PARSED_SCHEDULE_TIME_TOP_LEVEL_FIELDS = Object.freeze(
  parsedScheduleTimeBaseSchema.keyof().options,
);

export type ParsedScheduleTime = z.infer<typeof parsedScheduleTimeSchema>;
export type ScheduleSlotExtractionModelOutput = z.infer<
  typeof scheduleSlotExtractionSchema
>;

const planScheduleAssignmentShape = {
  date: isoDateSchema,
  endTime: timeSchema.nullable(),
  isAllDay: z.boolean(),
  startTime: timeSchema.nullable(),
  taskKey: z.string().trim().min(1).max(100),
};

const planScheduleAssignmentSchema = z.object(
  planScheduleAssignmentShape,
).strict();

const refinePlanScheduleTimes = (
  value: z.infer<typeof planScheduleAssignmentSchema>,
  context: z.RefinementCtx,
  pathPrefix: Array<number | string> = [],
) => {
  if (value.isAllDay) {
    if (value.startTime !== null || value.endTime !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "all-day assignments must not contain startTime or endTime",
        path: [...pathPrefix, "isAllDay"],
      });
    }
    return;
  }

  if (value.startTime === null || value.endTime === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "timed assignments require both startTime and endTime",
      path: [...pathPrefix, value.startTime === null ? "startTime" : "endTime"],
    });
    return;
  }

  if (value.startTime >= value.endTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startTime must be before endTime",
      path: [...pathPrefix, "endTime"],
    });
  }
};

const planScheduleDraftShape = {
  items: z.array(planScheduleAssignmentSchema).min(1).max(100),
};

export const planScheduleDraftBaseSchema = z.object(planScheduleDraftShape);

export const planScheduleDraftSchema = z.object(planScheduleDraftShape)
  .strict()
  .superRefine((value, context) => {
    for (const [index, item] of value.items.entries()) {
      refinePlanScheduleTimes(item, context, ["items", index]);
      if (!isCalendarDate(item.date)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "date must be a real calendar date",
          path: ["items", index, "date"],
        });
      }
    }
  });

export const PLAN_SCHEDULE_DRAFT_TOP_LEVEL_FIELDS = Object.freeze(
  planScheduleDraftBaseSchema.keyof().options,
);

export const PLAN_SCHEDULE_ASSIGNMENT_FIELDS = Object.freeze(
  Object.keys(planScheduleAssignmentShape),
);

const frozenSchedulePlanItemShape = {
  ...planScheduleAssignmentShape,
  phaseTitle: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
};

const frozenSchedulePlanItemSchema = z.object(
  frozenSchedulePlanItemShape,
).strict();

const frozenSchedulePlanProposalShape = {
  items: z.array(frozenSchedulePlanItemSchema).min(1).max(100),
  planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  planId: z.number().int().positive(),
  planTitle: z.string().trim().min(1).max(200),
  source: z.enum(["deterministic", "model"]),
  startDate: isoDateSchema,
};

export const frozenSchedulePlanProposalSchema = z.object(
  frozenSchedulePlanProposalShape,
).strict().superRefine((value, context) => {
  const start = isCalendarDate(value.startDate)
    ? new Date(`${value.startDate}T00:00:00.000Z`)
    : null;
  if (!start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must be a real calendar date",
      path: ["startDate"],
    });
  }
  const seen = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    refinePlanScheduleTimes(item, context, ["items", index]);
    const date = isCalendarDate(item.date)
      ? new Date(`${item.date}T00:00:00.000Z`)
      : null;
    if (
      !date
      || start
        && (date < start || date.getTime() > start.getTime() + 60 * 24 * 60 * 60 * 1_000)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "item date must be a real date within the proposal horizon",
        path: ["items", index, "date"],
      });
    }
    if (seen.has(item.taskKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "taskKey must be unique",
        path: ["items", index, "taskKey"],
      });
    }
    seen.add(item.taskKey);
  }
});

export type FrozenSchedulePlanProposal = z.infer<
  typeof frozenSchedulePlanProposalSchema
>;
export const formatFrozenScheduleItemTitle = (
  item: FrozenSchedulePlanProposal["items"][number],
): string => {
  const phasePrefix = `[${item.phaseTitle}] `;
  return item.title.startsWith(phasePrefix)
    ? item.title
    : `${phasePrefix}${item.title}`;
};
export type PlanScheduleDraft = z.infer<typeof planScheduleDraftSchema>;
