import type { ScheduleConflict } from "./conflict-awareness";
import type { ScheduleDraft } from "./draft";
import {
  findLocalFreeSlots,
  type LocalBusyBlock,
  type LocalFreeSlot,
} from "./free-slots";
import type { ScheduleSlots, ScheduleTimeWindow } from "./readiness";

export type ScheduleConflictSuggestion = {
  id: string;
  label: string;
  description?: string;
  action:
    | {
        type: "move_item";
        itemTitle: string;
        date?: string | null;
        startTime?: string | null;
        endTime?: string | null;
      }
    | {
        type: "allow_overlap";
      }
    | {
        type: "remove_item";
        itemTitle: string;
      }
    | {
        type: "manual_adjust";
        message: string;
      };
  riskLevel: "low" | "medium";
};

export type GenerateScheduleConflictSuggestionsInput = {
  busyBlocks?: LocalBusyBlock[];
  conflicts: ScheduleConflict[];
  draft: ScheduleDraft;
  slots?: ScheduleSlots;
};

const MAX_SUGGESTIONS = 5;
const LOCAL_FREE_SLOT_DESCRIPTION = "仅基于 SunnyPanel 本地日程检测，未包含外部日历；准备创建时会再次检查。";
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const slugPart = (value: string): string =>
  normalizeText(value)
    .replace(/[^\p{L}\p{N}:.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "item";

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

const conflictTitles = (conflicts: ScheduleConflict[], draft: ScheduleDraft): string[] => {
  const draftTitles = new Set(draft.items.map((item) => normalizeText(item.title)).filter(Boolean));

  return unique(
    conflicts
      .filter((conflict) => conflict.type !== "warning")
      .map((conflict) => normalizeText(conflict.proposedTitle))
      .filter((title) => draftTitles.has(title)),
  );
};

const findDraftItem = (draft: ScheduleDraft, title: string) =>
  draft.items.find((item) => normalizeText(item.title) === title) ?? null;

const timeToMinutes = (value: null | string | undefined): null | number => {
  const normalized = normalizeText(value);
  if (!timePattern.test(normalized)) return null;
  const [hour = 0, minute = 0] = normalized.split(":").map(Number);

  return hour * 60 + minute;
};

const minutesToTime = (value: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60, value));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const normalizeWindow = (window: ScheduleTimeWindow) => ({
  date: normalizeText(window.day) || null,
  endTime: normalizeText(window.endTime) || null,
  startTime: normalizeText(window.startTime) || null,
});

const isSameWindow = (
  left: ReturnType<typeof normalizeWindow>,
  right: {
    date?: null | string;
    endTime?: null | string;
    startTime?: null | string;
  },
): boolean =>
  Boolean(left.date) &&
  left.date === normalizeText(right.date) &&
  left.startTime === normalizeText(right.startTime) &&
  left.endTime === normalizeText(right.endTime);

const alternateWindowFor = (
  input: GenerateScheduleConflictSuggestionsInput,
  itemTitle: string,
) => {
  const windows = input.slots?.availableTimeWindows ?? [];
  if (!Array.isArray(windows) || windows.length === 0) return null;

  const draftItem = findDraftItem(input.draft, itemTitle);
  const conflict = input.conflicts.find(
    (item) => normalizeText(item.proposedTitle) === itemTitle,
  );
  const current = {
    date: draftItem?.date ?? conflict?.proposedDate ?? null,
    endTime: draftItem?.endTime ?? conflict?.proposedEndTime ?? null,
    startTime: draftItem?.startTime ?? conflict?.proposedStartTime ?? null,
  };

  for (const window of windows) {
    const normalized = normalizeWindow(window);
    if (!normalized.date && !normalized.startTime && !normalized.endTime) continue;
    if (isSameWindow(normalized, current)) continue;

    return normalized;
  }

  return null;
};

const durationMinutesFor = (
  input: GenerateScheduleConflictSuggestionsInput,
  itemTitle: string,
): number => {
  const draftItem = findDraftItem(input.draft, itemTitle);
  const conflict = input.conflicts.find(
    (item) => normalizeText(item.proposedTitle) === itemTitle,
  );
  const start = timeToMinutes(draftItem?.startTime ?? conflict?.proposedStartTime);
  const end = timeToMinutes(draftItem?.endTime ?? conflict?.proposedEndTime);

  if (start !== null && end !== null && start < end) {
    return end - start;
  }

  return typeof draftItem?.estimatedMinutes === "number" && draftItem.estimatedMinutes > 0
    ? draftItem.estimatedMinutes
    : 60;
};

const currentWindowFor = (
  input: GenerateScheduleConflictSuggestionsInput,
  itemTitle: string,
) => {
  const draftItem = findDraftItem(input.draft, itemTitle);
  const conflict = input.conflicts.find(
    (item) => normalizeText(item.proposedTitle) === itemTitle,
  );

  return {
    date: draftItem?.date ?? conflict?.proposedDate ?? null,
    endTime: draftItem?.endTime ?? conflict?.proposedEndTime ?? null,
    startTime: draftItem?.startTime ?? conflict?.proposedStartTime ?? null,
  };
};

const exactMoveWindowFromFreeSlot = (
  freeSlot: LocalFreeSlot,
  durationMinutes: number,
) => ({
  date: freeSlot.date,
  endTime: minutesToTime(timeToMinutes(freeSlot.startTime)! + durationMinutes),
  startTime: freeSlot.startTime,
});

const localFreeWindowFor = (
  input: GenerateScheduleConflictSuggestionsInput,
  itemTitle: string,
) => {
  const windows = input.slots?.availableTimeWindows ?? [];
  if (!Array.isArray(windows) || windows.length === 0 || !input.busyBlocks) return null;

  const durationMinutes = durationMinutesFor(input, itemTitle);
  const current = currentWindowFor(input, itemTitle);
  const freeSlots = findLocalFreeSlots({
    availableTimeWindows: windows,
    busyBlocks: input.busyBlocks,
    durationMinutes,
    maxSuggestions: MAX_SUGGESTIONS,
  });

  for (const freeSlot of freeSlots) {
    const moveWindow = exactMoveWindowFromFreeSlot(freeSlot, durationMinutes);
    if (isSameWindow(moveWindow, current)) continue;

    return moveWindow;
  }

  return null;
};

const addSuggestion = (
  suggestions: ScheduleConflictSuggestion[],
  suggestion: ScheduleConflictSuggestion,
) => {
  if (suggestions.length >= MAX_SUGGESTIONS) return;
  if (suggestions.some((item) => item.id === suggestion.id)) return;
  suggestions.push(suggestion);
};

export const generateScheduleConflictSuggestions = (
  input: GenerateScheduleConflictSuggestionsInput,
): ScheduleConflictSuggestion[] => {
  if (!Array.isArray(input.conflicts) || input.conflicts.length === 0) {
    return [];
  }

  const suggestions: ScheduleConflictSuggestion[] = [];
  const titles = conflictTitles(input.conflicts, input.draft);

  addSuggestion(suggestions, {
    action: { type: "allow_overlap" },
    description: "只记录允许重叠；选择后会更新草案策略，准备创建时会再次检查真实冲突。",
    id: "allow-overlap",
    label: "允许重叠并继续",
    riskLevel: "medium",
  });

  for (const title of titles) {
    const localWindow = localFreeWindowFor(input, title);
    const window = localWindow ?? (input.busyBlocks ? null : alternateWindowFor(input, title));
    if (!window) continue;

    addSuggestion(suggestions, {
      action: {
        date: window.date,
        endTime: window.endTime,
        itemTitle: title,
        startTime: window.startTime,
        type: "move_item",
      },
      description: localWindow
        ? LOCAL_FREE_SLOT_DESCRIPTION
        : "该建议尚未重新检查真实冲突；准备创建时会再次检查。",
      id: `move-item-${slugPart(title)}-${slugPart(window.date ?? "date")}-${slugPart(window.startTime ?? "start")}-${slugPart(window.endTime ?? "end")}`,
      label: `改到 ${[window.date, [window.startTime, window.endTime].filter(Boolean).join("-")].filter(Boolean).join(" ")}`,
      riskLevel: "low",
    });
  }

  for (const title of titles) {
    addSuggestion(suggestions, {
      action: {
        itemTitle: title,
        type: "remove_item",
      },
      description: "只是从草案移除，不删除任何真实日程项。",
      id: `remove-item-${slugPart(title)}`,
      label: `暂不安排${title}`,
      riskLevel: "low",
    });
  }

  const hasMoveSuggestion = suggestions.some((suggestion) => suggestion.action.type === "move_item");
  if (!hasMoveSuggestion) {
    addSuggestion(suggestions, {
      action: {
        message: "我想手动指定新的日期或时间段",
        type: "manual_adjust",
      },
      description: "你可以直接输入新的日期或时间段；我会先更新草案，不会写入日程。",
      id: "manual-adjust",
      label: "手动指定新的日期或时间段",
      riskLevel: "low",
    });
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
};

export const scheduleConflictSuggestionToUserMessage = (
  suggestion: ScheduleConflictSuggestion,
): string => {
  switch (suggestion.action.type) {
    case "allow_overlap":
      return "允许重叠";
    case "remove_item":
      return `删除“${suggestion.action.itemTitle}”这个日程项`;
    case "move_item": {
      const target = [
        suggestion.action.date,
        [suggestion.action.startTime, suggestion.action.endTime]
          .filter(Boolean)
          .join("-"),
      ].filter(Boolean).join(" ");

      return `把“${suggestion.action.itemTitle}”改到 ${target}`;
    }
    case "manual_adjust":
      return suggestion.action.message;
  }
};
