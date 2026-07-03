import type { CreateScheduleItemsArgs } from "../schemas";

export type ScheduleConflictSeverity = "info" | "warning" | "blocking";

export type ScheduleConflict = {
  type: "internal" | "existing" | "warning";
  severity: ScheduleConflictSeverity;
  proposedTitle: string;
  proposedDate?: null | string;
  proposedStartTime?: null | string;
  proposedEndTime?: null | string;
  existingTitle?: null | string;
  existingScheduleItemId?: null | number | string;
  message: string;
};

export type ScheduleConflictPolicy = "allow-overlap" | "ask" | "reschedule" | "skip";

export type ProposedScheduleConflictItem = {
  date?: null | string;
  endTime?: null | string;
  isAllDay?: boolean | null;
  startTime?: null | string;
  title: string;
};

export type ExistingScheduleConflictItem = {
  date?: null | string;
  endTime?: null | string;
  id: number | string;
  isAllDay?: boolean | null;
  startTime?: null | string;
  status?: null | string;
  title?: null | string;
};

export type ScheduleConflictSummary = {
  conflictCount: number;
  conflictPolicy?: null | ScheduleConflictPolicy;
  existingScheduleChecked: boolean;
  message: string;
  warningCount: number;
};

export type DetectScheduleConflictsForItemsInput = {
  existingItems?: ExistingScheduleConflictItem[];
  proposedItems: ProposedScheduleConflictItem[];
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const normalizeDateKey = (value: null | string | undefined): string => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const isoDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (isoDate?.[1]) return isoDate[1];

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized.slice(0, 10);

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const isValidTime = (value: null | string | undefined): value is string =>
  timePattern.test(normalizeText(value));

const timeToMinutes = (value: null | string | undefined): null | number => {
  if (!isValidTime(value)) return null;
  const [hour = 0, minute = 0] = normalizeText(value).split(":").map(Number);

  return hour * 60 + minute;
};

const isProposedAllDay = (item: ProposedScheduleConflictItem): boolean => item.isAllDay === true;

const isExistingAllDay = (item: ExistingScheduleConflictItem): boolean =>
  item.isAllDay === true || (!normalizeText(item.startTime) && !normalizeText(item.endTime));

const hasValidTimedRange = (item: Pick<ProposedScheduleConflictItem, "endTime" | "startTime">): boolean => {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);

  return start !== null && end !== null && start < end;
};

const proposedNeedsTimeWarning = (item: ProposedScheduleConflictItem): boolean =>
  !isProposedAllDay(item) && !hasValidTimedRange(item);

const existingIsActive = (item: ExistingScheduleConflictItem): boolean =>
  item.status !== "canceled" && item.status !== "cancelled";

const rangesOverlap = (
  left: ProposedScheduleConflictItem,
  right: ProposedScheduleConflictItem | ExistingScheduleConflictItem,
): boolean => {
  if (isProposedAllDay(left) || ("id" in right ? isExistingAllDay(right) : isProposedAllDay(right))) {
    return true;
  }

  const leftStart = timeToMinutes(left.startTime);
  const leftEnd = timeToMinutes(left.endTime);
  const rightStart = timeToMinutes(right.startTime);
  const rightEnd = timeToMinutes(right.endTime);

  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
};

const timeLabel = (item: Pick<ProposedScheduleConflictItem, "endTime" | "isAllDay" | "startTime">): string =>
  item.isAllDay ? "全天" : [item.startTime, item.endTime].filter(Boolean).join("-") || "未定时间";

const proposedTitle = (item: ProposedScheduleConflictItem): string =>
  normalizeText(item.title) || "未命名日程项";

const existingTitle = (item: ExistingScheduleConflictItem): string =>
  normalizeText(item.title) || `日程 #${item.id}`;

const baseProposedFields = (item: ProposedScheduleConflictItem) => ({
  proposedDate: normalizeDateKey(item.date) || normalizeText(item.date) || null,
  proposedEndTime: normalizeText(item.endTime) || null,
  proposedStartTime: normalizeText(item.startTime) || null,
  proposedTitle: proposedTitle(item),
});

export const scheduleConflictFromExistingMatch = (
  proposedItem: ProposedScheduleConflictItem,
  existingItem: Pick<ExistingScheduleConflictItem, "endTime" | "id" | "startTime" | "title">,
): ScheduleConflict => ({
  ...baseProposedFields(proposedItem),
  existingScheduleItemId: existingItem.id,
  existingTitle: existingTitle(existingItem),
  message: `「${proposedTitle(proposedItem)}」与已有日程「${existingTitle(existingItem)}」时间重叠。`,
  severity: "warning",
  type: "existing",
});

export const shouldCheckExistingScheduleConflicts = (item: ProposedScheduleConflictItem): boolean =>
  Boolean(normalizeDateKey(item.date)) && (isProposedAllDay(item) || hasValidTimedRange(item));

export const detectScheduleConflictsForItems = (
  input: DetectScheduleConflictsForItemsInput,
): ScheduleConflict[] => {
  const conflicts: ScheduleConflict[] = [];
  const proposedItems = input.proposedItems.map((item) => ({ ...item }));
  const existingItems = (input.existingItems ?? []).map((item) => ({ ...item }));

  for (const item of proposedItems) {
    if (proposedNeedsTimeWarning(item)) {
      conflicts.push({
        ...baseProposedFields(item),
        existingScheduleItemId: null,
        existingTitle: null,
        message: `「${proposedTitle(item)}」缺少开始或结束时间，已跳过时间重叠检测。`,
        severity: "info",
        type: "warning",
      });
    }
  }

  const comparableProposed = proposedItems.filter((item) => shouldCheckExistingScheduleConflicts(item));

  for (let leftIndex = 0; leftIndex < comparableProposed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < comparableProposed.length; rightIndex += 1) {
      const left = comparableProposed[leftIndex]!;
      const right = comparableProposed[rightIndex]!;

      if (normalizeDateKey(left.date) !== normalizeDateKey(right.date) || !rangesOverlap(left, right)) {
        continue;
      }

      conflicts.push({
        ...baseProposedFields(left),
        existingScheduleItemId: null,
        existingTitle: proposedTitle(right),
        message: `「${proposedTitle(left)}」与草案中的「${proposedTitle(right)}」在 ${normalizeDateKey(left.date)} ${timeLabel(left)} 时间重叠。`,
        severity: "warning",
        type: "internal",
      });
    }
  }

  for (const proposedItem of comparableProposed) {
    const proposedDate = normalizeDateKey(proposedItem.date);

    for (const existingItem of existingItems) {
      if (!existingIsActive(existingItem)) continue;
      if (normalizeDateKey(existingItem.date) !== proposedDate) continue;
      if (!rangesOverlap(proposedItem, existingItem)) continue;

      conflicts.push(scheduleConflictFromExistingMatch(proposedItem, existingItem));
    }
  }

  return conflicts;
};

export const formatScheduleConflictLines = (conflicts: ScheduleConflict[], limit = 5): string[] =>
  conflicts.slice(0, limit).map((conflict) => {
    if (conflict.type === "warning") return `- ${conflict.message}`;
    const time = [conflict.proposedStartTime, conflict.proposedEndTime].filter(Boolean).join("-");

    return `- ${conflict.proposedDate ?? "未定日期"}${time ? ` ${time}` : ""}：${conflict.message}`;
  });

const policyMessage = (
  conflictCount: number,
  conflictPolicy: null | ScheduleConflictPolicy | undefined,
): string => {
  if (conflictCount === 0) {
    return "未发现明显时间冲突。仅基于 SunnyPanel 当前 schedule-items 检测，未包含外部日历。";
  }

  if (conflictPolicy === "allow-overlap") {
    return `发现 ${conflictCount} 个时间冲突。你允许重叠，以下是重叠提醒；系统不会自动重排。`;
  }

  if (conflictPolicy === "skip") {
    return `发现 ${conflictCount} 个时间冲突。你选择了跳过冲突，但自动跳过将在后续阶段实现；L1 不会自动删除日程项。`;
  }

  if (conflictPolicy === "reschedule") {
    return `发现 ${conflictCount} 个时间冲突。自动重排将在后续阶段实现；系统不会自动重排，请确认是否仍要写入日程。`;
  }

  return `发现 ${conflictCount} 个时间冲突。系统不会自动重排，请确认是否仍要写入日程。`;
};

export const buildScheduleConflictSummary = ({
  conflictPolicy,
  conflicts,
  existingScheduleChecked,
}: {
  conflictPolicy?: null | ScheduleConflictPolicy;
  conflicts: ScheduleConflict[];
  existingScheduleChecked: boolean;
}): ScheduleConflictSummary => {
  const conflictCount = conflicts.filter((conflict) => conflict.type !== "warning").length;
  const warningCount = conflicts.length - conflictCount;
  const baseMessage = policyMessage(conflictCount, conflictPolicy);
  const warningMessage = warningCount > 0 ? `另有 ${warningCount} 个时间信息提醒。` : "";
  const scopeMessage = existingScheduleChecked
    ? "仅基于 SunnyPanel 当前 schedule-items 检测，未包含外部日历。"
    : "本次仅完成草案内部冲突检查；未连接现有日程检测。";
  const message = conflictCount > 0
    ? [baseMessage, warningMessage, scopeMessage].filter(Boolean).join(" ")
    : [baseMessage, warningMessage].filter(Boolean).join(" ");

  return {
    conflictCount,
    conflictPolicy: conflictPolicy ?? null,
    existingScheduleChecked,
    message,
    warningCount,
  };
};

export const getCreateScheduleItemsConflictPolicy = (
  args: CreateScheduleItemsArgs,
): null | ScheduleConflictPolicy => {
  const value = args.conflictPolicy;

  return value === "ask" || value === "skip" || value === "allow-overlap" || value === "reschedule"
    ? value
    : null;
};
