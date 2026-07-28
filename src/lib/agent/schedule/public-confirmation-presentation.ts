import { isRecord } from "@/lib/shared/is-record";

import type { ScheduleConflict } from "./conflict-awareness";
import type { ScheduleConflictSuggestion } from "./conflict-suggestions";

type ScheduleConflictPolicy = "allow-overlap" | "ask" | "reschedule" | "skip";

export type ScheduleCreationPublicPresentation = {
  conflictSummary: {
    conflictCount: number;
    conflictPolicy?: null | ScheduleConflictPolicy;
    existingScheduleChecked: boolean;
    message: string;
    warningCount: number;
  };
  conflicts: ScheduleConflict[];
  conflictSuggestions: ScheduleConflictSuggestion[];
  dateRange: string;
  itemCount: number;
  sourceChecklistId?: null | number;
  sourcePlanId?: null | number;
  title?: null | string;
};

const conflictPolicies = new Set<ScheduleConflictPolicy>([
  "allow-overlap",
  "ask",
  "reschedule",
  "skip",
]);
const conflictSeverities = new Set<ScheduleConflict["severity"]>([
  "blocking",
  "info",
  "warning",
]);
const conflictTypes = new Set<ScheduleConflict["type"]>([
  "existing",
  "internal",
  "warning",
]);

const optionalNullableString = (
  value: unknown,
): null | string | undefined =>
  value === null || typeof value === "string" ? value : undefined;

const positiveSafeInteger = (value: unknown): number | undefined =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value > 0
    ? value
    : undefined;

const nonNegativeSafeInteger = (value: unknown): number | undefined =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value >= 0
    ? value
    : undefined;

const parseExistingScheduleItemId = (
  value: unknown,
): null | number | string | undefined => {
  if (value === null) return null;
  if (positiveSafeInteger(value)) return value as number;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
};

const parseScheduleCreationConflict = (
  value: unknown,
): null | ScheduleConflict => {
  if (
    !isRecord(value)
    || typeof value.type !== "string"
    || !conflictTypes.has(value.type as ScheduleConflict["type"])
    || typeof value.severity !== "string"
    || !conflictSeverities.has(value.severity as ScheduleConflict["severity"])
    || typeof value.proposedTitle !== "string"
    || typeof value.message !== "string"
  ) {
    return null;
  }

  const existingScheduleItemId = parseExistingScheduleItemId(
    value.existingScheduleItemId,
  );
  const existingTitle = optionalNullableString(value.existingTitle);
  const proposedDate = optionalNullableString(value.proposedDate);
  const proposedEndTime = optionalNullableString(value.proposedEndTime);
  const proposedStartTime = optionalNullableString(value.proposedStartTime);

  return {
    ...(existingScheduleItemId !== undefined ? { existingScheduleItemId } : {}),
    ...(existingTitle !== undefined ? { existingTitle } : {}),
    message: value.message,
    ...(proposedDate !== undefined ? { proposedDate } : {}),
    ...(proposedEndTime !== undefined ? { proposedEndTime } : {}),
    ...(proposedStartTime !== undefined ? { proposedStartTime } : {}),
    proposedTitle: value.proposedTitle,
    severity: value.severity as ScheduleConflict["severity"],
    type: value.type as ScheduleConflict["type"],
  };
};

const parseScheduleConflictSuggestionAction = (
  value: unknown,
): null | ScheduleConflictSuggestion["action"] => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "allow_overlap") {
    return { type: "allow_overlap" };
  }

  if (value.type === "manual_adjust" && typeof value.message === "string") {
    return {
      message: value.message,
      type: "manual_adjust",
    };
  }

  if (value.type === "remove_item" && typeof value.itemTitle === "string") {
    return {
      itemTitle: value.itemTitle,
      type: "remove_item",
    };
  }

  if (value.type !== "move_item" || typeof value.itemTitle !== "string") {
    return null;
  }

  const date = optionalNullableString(value.date);
  const endTime = optionalNullableString(value.endTime);
  const startTime = optionalNullableString(value.startTime);

  return {
    ...(date !== undefined ? { date } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    itemTitle: value.itemTitle,
    ...(startTime !== undefined ? { startTime } : {}),
    type: "move_item",
  };
};

const parseScheduleConflictSuggestion = (
  value: unknown,
): null | ScheduleConflictSuggestion => {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || value.id.length === 0
    || typeof value.label !== "string"
    || value.label.length === 0
    || (value.riskLevel !== "low" && value.riskLevel !== "medium")
  ) {
    return null;
  }

  const action = parseScheduleConflictSuggestionAction(value.action);
  if (!action) return null;

  return {
    action,
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    id: value.id,
    label: value.label,
    riskLevel: value.riskLevel,
  };
};

/**
 * Converts either an internal Schedule dry-run snapshot or an already-public
 * presentation into the exact non-executable fields used by confirmation UI.
 */
export const parseScheduleCreationPublicPresentation = (
  value: unknown,
): null | ScheduleCreationPublicPresentation => {
  if (!isRecord(value) || !isRecord(value.conflictSummary)) {
    return null;
  }

  const summary = value.conflictSummary;
  if (typeof summary.message !== "string") {
    return null;
  }

  const conflicts = Array.isArray(value.conflicts)
    ? value.conflicts
        .map(parseScheduleCreationConflict)
        .filter((item): item is ScheduleConflict => item !== null)
        .slice(0, 20)
    : Array.isArray(value.scheduleConflicts)
      ? value.scheduleConflicts
          .map(parseScheduleCreationConflict)
          .filter((item): item is ScheduleConflict => item !== null)
          .slice(0, 20)
      : [];
  const conflictSuggestions = Array.isArray(value.conflictSuggestions)
    ? value.conflictSuggestions
        .map(parseScheduleConflictSuggestion)
        .filter((item): item is ScheduleConflictSuggestion => item !== null)
        .slice(0, 5)
    : [];
  const conflictCount = nonNegativeSafeInteger(summary.conflictCount)
    ?? conflicts.filter((conflict) => conflict.type !== "warning").length;
  const warningCount = nonNegativeSafeInteger(summary.warningCount)
    ?? conflicts.filter((conflict) => conflict.type === "warning").length;
  const conflictPolicy =
    summary.conflictPolicy === null
      ? null
      : typeof summary.conflictPolicy === "string"
        && conflictPolicies.has(summary.conflictPolicy as ScheduleConflictPolicy)
        ? summary.conflictPolicy as ScheduleConflictPolicy
        : undefined;
  const itemCount = nonNegativeSafeInteger(value.itemCount)
    ?? (Array.isArray(value.items) ? value.items.length : 0);
  const sourceChecklistId = value.sourceChecklistId === null
    ? null
    : positiveSafeInteger(value.sourceChecklistId);
  const sourcePlanId = value.sourcePlanId === null
    ? null
    : positiveSafeInteger(value.sourcePlanId);
  const title = optionalNullableString(value.title);

  return {
    conflictSummary: {
      conflictCount,
      ...(conflictPolicy !== undefined ? { conflictPolicy } : {}),
      existingScheduleChecked: summary.existingScheduleChecked === true,
      message: summary.message,
      warningCount,
    },
    conflicts,
    conflictSuggestions,
    dateRange: typeof value.dateRange === "string"
      ? value.dateRange
      : "未确定日期",
    itemCount,
    ...(sourceChecklistId !== undefined ? { sourceChecklistId } : {}),
    ...(sourcePlanId !== undefined ? { sourcePlanId } : {}),
    ...(title !== undefined ? { title } : {}),
  };
};
