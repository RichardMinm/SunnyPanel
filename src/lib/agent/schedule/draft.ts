import type { ScheduleSlots, ScheduleTaskSlot, ScheduleTimeWindow } from "./readiness";

export type ScheduleDraftItem = {
  title: string;
  sourceTaskTitle?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  estimatedMinutes?: number | null;
  sourcePlanId?: number | null;
  sourceChecklistId?: number | null;
  sourceChecklistItemKey?: string | null;
  conflictNote?: string | null;
};

export type ScheduleDraft = {
  title: string;
  sourceType: "plan" | "checklist" | "manual";
  sourcePlanId?: number | null;
  sourceChecklistId?: number | null;
  items: ScheduleDraftItem[];
  assumptions?: string[];
  conflicts?: string[];
  nextActions?: string[];
};

export type GenerateScheduleDraftInput = {
  slots: ScheduleSlots;
  userMessage?: string;
};

export class ScheduleDraftGenerationError extends Error {
  code: "missing_tasks";
  missingSlots: string[];

  constructor(code: ScheduleDraftGenerationError["code"], missingSlots: string[]) {
    super(`Insufficient schedule slots for draft: ${missingSlots.join(", ")}`);
    this.name = "ScheduleDraftGenerationError";
    this.code = code;
    this.missingSlots = missingSlots;
  }
}

export const MAX_SCHEDULE_DRAFT_ITEMS = 24;
export const MAX_SCHEDULE_DRAFT_LIST_ITEMS = 8;

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const isUsefulNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeSourceType = (value: ScheduleSlots["sourceType"]): ScheduleDraft["sourceType"] =>
  value === "plan" || value === "checklist" || value === "manual" ? value : "manual";

const normalizeTasks = (tasks: ScheduleSlots["tasks"]): ScheduleTaskSlot[] =>
  Array.isArray(tasks)
    ? tasks
        .filter((task) => isUsefulString(task.title))
        .map((task) => ({
          ...task,
          title: normalizeText(task.title),
        }))
        .slice(0, MAX_SCHEDULE_DRAFT_ITEMS)
    : [];

const normalizeWindows = (windows: ScheduleSlots["availableTimeWindows"]): ScheduleTimeWindow[] =>
  Array.isArray(windows)
    ? windows
        .map((window) => ({
          ...(isUsefulString(window.day) ? { day: normalizeText(window.day) } : {}),
          ...(isUsefulString(window.startTime) ? { startTime: normalizeText(window.startTime) } : {}),
          ...(isUsefulString(window.endTime) ? { endTime: normalizeText(window.endTime) } : {}),
        }))
        .filter((window) => window.day || window.startTime || window.endTime)
    : [];

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const buildTitle = (slots: ScheduleSlots, itemCount: number): string => {
  const sourceLabel =
    slots.sourceType === "plan"
      ? "计划"
      : slots.sourceType === "checklist"
        ? "清单"
        : "任务";
  const deadline = isUsefulString(slots.deadline) ? `（${normalizeText(slots.deadline)}）` : "";
  return `${sourceLabel}日程草案${deadline}：${itemCount} 项任务`;
};

const buildAssumptions = (slots: ScheduleSlots, userMessage?: string): string[] => {
  const assumptions = [
    "这是规则生成的日程草案，尚未写入日程。",
    isUsefulString(slots.deadline)
      ? `将以${normalizeText(slots.deadline)}前完成为目标。`
      : null,
    isUsefulString(slots.preferredTime)
      ? `偏好安排在${normalizeText(slots.preferredTime)}；具体日期仍需确认。`
      : null,
    isUsefulString(slots.dailyCapacity)
      ? `可投入时间按“${normalizeText(slots.dailyCapacity)}”估算。`
      : null,
    isUsefulString(slots.durationEstimate)
      ? `任务时长估计参考：${normalizeText(slots.durationEstimate)}。`
      : null,
    Array.isArray(slots.availableDays) && slots.availableDays.length > 0
      ? `可安排日期偏好：${unique(slots.availableDays).join("、")}。`
      : null,
    userMessage && isUsefulString(userMessage)
      ? `本轮补充信息已纳入草案：${normalizeText(userMessage)}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return unique(assumptions).slice(0, MAX_SCHEDULE_DRAFT_LIST_ITEMS);
};

const buildDraftItem = ({
  slots,
  task,
  window,
}: {
  slots: ScheduleSlots;
  task: ScheduleTaskSlot;
  window?: ScheduleTimeWindow;
}): ScheduleDraftItem => ({
  title: normalizeText(task.title),
  ...(isUsefulString(task.sourceTaskTitle) ? { sourceTaskTitle: normalizeText(task.sourceTaskTitle) } : {}),
  ...(isUsefulString(window?.day) ? { date: normalizeText(window.day) } : {}),
  ...(isUsefulString(window?.startTime) ? { startTime: normalizeText(window.startTime) } : {}),
  ...(isUsefulString(window?.endTime) ? { endTime: normalizeText(window.endTime) } : {}),
  ...(isUsefulNumber(task.estimatedMinutes) ? { estimatedMinutes: task.estimatedMinutes } : {}),
  ...(isUsefulNumber(task.sourcePlanId)
    ? { sourcePlanId: task.sourcePlanId }
    : isUsefulNumber(slots.sourcePlanId)
      ? { sourcePlanId: slots.sourcePlanId }
      : task.sourcePlanId === null || slots.sourcePlanId === null
        ? { sourcePlanId: null }
        : {}),
  ...(isUsefulNumber(task.sourceChecklistId)
    ? { sourceChecklistId: task.sourceChecklistId }
    : isUsefulNumber(slots.sourceChecklistId)
      ? { sourceChecklistId: slots.sourceChecklistId }
      : task.sourceChecklistId === null || slots.sourceChecklistId === null
        ? { sourceChecklistId: null }
        : {}),
  ...(isUsefulString(task.sourceChecklistItemKey)
    ? { sourceChecklistItemKey: normalizeText(task.sourceChecklistItemKey) }
    : {}),
  conflictNote: "尚未检查已有日程冲突，确认写入前需要进行冲突检测。",
});

export const generateScheduleDraft = (
  input: GenerateScheduleDraftInput,
): ScheduleDraft => {
  const slots = input.slots;
  const tasks = normalizeTasks(slots.tasks);

  if (tasks.length === 0) {
    throw new ScheduleDraftGenerationError("missing_tasks", ["tasks"]);
  }

  const windows = normalizeWindows(slots.availableTimeWindows);
  const items = tasks.map((task, index) =>
    buildDraftItem({
      slots,
      task,
      window: windows.length > 0 ? windows[index % windows.length] : undefined,
    }),
  );
  const sourceType = normalizeSourceType(slots.sourceType);

  return {
    title: buildTitle(slots, items.length),
    sourceType,
    ...(isUsefulNumber(slots.sourcePlanId) ? { sourcePlanId: slots.sourcePlanId } : {}),
    ...(isUsefulNumber(slots.sourceChecklistId) ? { sourceChecklistId: slots.sourceChecklistId } : {}),
    items,
    assumptions: buildAssumptions(slots, input.userMessage),
    conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
    nextActions: [
      "调整时间",
      "改成上午",
      "跳过周末",
      "就按这个创建日程",
    ],
  };
};
