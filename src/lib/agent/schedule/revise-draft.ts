import type { ScheduleConflict, ScheduleConflictPolicy } from "./conflict-awareness";
import type { ScheduleDraft, ScheduleDraftItem } from "./draft";

export type ScheduleDraftRevisionAction =
  | {
      type: "update_time";
      target: "all" | "conflicting" | "matched";
      itemTitle?: null | string;
      date?: null | string;
      startTime?: null | string;
      endTime?: null | string;
    }
  | {
      type: "remove_item";
      itemTitle: string;
    }
  | {
      type: "set_conflict_policy";
      conflictPolicy: ScheduleConflictPolicy;
    }
  | {
      type: "note";
      message: string;
    };

export type ReviseScheduleDraftInput = {
  conflicts?: ScheduleConflict[];
  draft: ScheduleDraft;
  referenceDate?: string;
  userMessage: string;
};

export type ReviseScheduleDraftResult = {
  appliedActions: ScheduleDraftRevisionAction[];
  clarificationQuestions?: string[];
  draft: ScheduleDraft;
  needsClarification: boolean;
  summary: string;
};

type ParsedTimeUpdate = {
  date?: null | string;
  endTime?: null | string;
  startTime?: null | string;
};

const morningRange = { endTime: "11:00", startTime: "09:00" };
const afternoonRange = { endTime: "17:00", startTime: "14:00" };
const eveningRange = { endTime: "22:00", startTime: "20:00" };
const dayInMs = 24 * 60 * 60 * 1000;
const timePattern = /^([01]?\d|2[0-3]):[0-5]\d$/u;
const weekdayMap: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

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

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseReferenceDate = (value?: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * dayInMs);

const nextWeekday = (reference: Date, targetWeekday: number): Date => {
  const current = reference.getDay();
  let delta = (targetWeekday - current + 7) % 7;
  if (delta === 0) delta = 7;

  return addDays(reference, delta);
};

const parseDate = (message: string, referenceDate?: string): null | string => {
  const explicitIso = message.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/u);
  if (explicitIso) {
    return `${explicitIso[1]}-${String(Number(explicitIso[2])).padStart(2, "0")}-${String(Number(explicitIso[3])).padStart(2, "0")}`;
  }

  const reference = parseReferenceDate(referenceDate);
  const monthDay = message.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
  if (monthDay && reference) {
    return `${reference.getFullYear()}-${String(Number(monthDay[1])).padStart(2, "0")}-${String(Number(monthDay[2])).padStart(2, "0")}`;
  }

  if (!reference) return null;

  if (/今天|今日/u.test(message)) return toDateKey(reference);
  if (/明天|明日/u.test(message)) return toDateKey(addDays(reference, 1));
  if (/后天/u.test(message)) return toDateKey(addDays(reference, 2));

  const weekday = message.match(/(?:周|星期)([一二三四五六日天])/u);
  if (weekday?.[1]) {
    return toDateKey(nextWeekday(reference, weekdayMap[weekday[1]] ?? 1));
  }

  if (/周末/u.test(message)) return toDateKey(nextWeekday(reference, 6));
  if (/工作日/u.test(message)) return toDateKey(nextWeekday(reference, 1));

  return null;
};

const normalizeHour = (hour: number, period?: string): number => {
  if ((period === "下午" || period === "晚上") && hour < 12) {
    return hour + 12;
  }

  return hour;
};

const formatTime = (hour: number, minute = 0): string =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const parseTimeRange = (message: string): Pick<ParsedTimeUpdate, "endTime" | "startTime"> => {
  const colonRange = message.match(/([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|到|至)\s*([01]?\d|2[0-3]):([0-5]\d)/u);
  if (colonRange) {
    return {
      endTime: formatTime(Number(colonRange[3]), Number(colonRange[4])),
      startTime: formatTime(Number(colonRange[1]), Number(colonRange[2])),
    };
  }

  const hourRange = message.match(/(上午|下午|晚上)?\s*(\d{1,2})\s*点(?:半)?\s*(?:-|到|至)\s*(\d{1,2})\s*点?/u);
  if (hourRange) {
    const period = hourRange[1];
    const start = normalizeHour(Number(hourRange[2]), period);
    const end = normalizeHour(Number(hourRange[3]), period);

    return {
      endTime: formatTime(end),
      startTime: formatTime(start),
    };
  }

  if (/上午/u.test(message)) return morningRange;
  if (/下午/u.test(message)) return afternoonRange;
  if (/晚上|今晚/u.test(message)) return eveningRange;

  return {};
};

const parseTimeUpdate = (message: string, referenceDate?: string): ParsedTimeUpdate => ({
  date: parseDate(message, referenceDate),
  ...parseTimeRange(message),
});

const hasUsefulTimeUpdate = (update: ParsedTimeUpdate): boolean =>
  Boolean(update.date || update.startTime || update.endTime);

const isValidTimeUpdate = (update: ParsedTimeUpdate): boolean => {
  if (!update.startTime && !update.endTime) return true;
  if (!update.startTime || !update.endTime) return false;
  if (!timePattern.test(update.startTime) || !timePattern.test(update.endTime)) return false;

  return update.startTime < update.endTime;
};

const quotedTitle = (message: string): null | string => {
  const match = message.match(/[“"']([^”"']+)[”"']/u);

  return match?.[1] ? normalizeText(match[1]) : null;
};

const looseTitle = (message: string): null | string => {
  const match = message.match(/把\s*([^，。:：]+?)\s*(?:改到|调整到|放到|从草案里移除|移除|删除|先不要安排|不要安排)/u);
  if (!match?.[1]) return null;

  return normalizeText(match[1].replace(/这个|任务|日程项/gu, ""));
};

const indexTarget = (message: string): null | number => {
  const match = message.match(/第\s*(\d+)\s*个/u);
  if (!match?.[1]) return null;

  return Math.max(0, Number(match[1]) - 1);
};

const conflictingTitles = (conflicts?: ScheduleConflict[]): string[] =>
  unique(
    (conflicts ?? [])
      .filter((conflict) => conflict.type !== "warning")
      .map((conflict) => conflict.proposedTitle),
  );

const findTargetIndexes = ({
  conflicts,
  draft,
  message,
}: {
  conflicts?: ScheduleConflict[];
  draft: ScheduleDraft;
  message: string;
}): { indexes: number[]; reason?: string; target: "conflicting" | "matched" } => {
  if (/冲突/u.test(message)) {
    const titles = conflictingTitles(conflicts);
    if (titles.length === 0) {
      return { indexes: [], reason: "no_conflicts", target: "conflicting" };
    }

    return {
      indexes: draft.items
        .map((item, index) => (titles.includes(item.title) ? index : -1))
        .filter((index) => index >= 0),
      target: "conflicting",
    };
  }

  const targetIndex = indexTarget(message);
  if (targetIndex !== null) {
    return draft.items[targetIndex]
      ? { indexes: [targetIndex], target: "matched" }
      : { indexes: [], reason: "missing_index", target: "matched" };
  }

  const title = quotedTitle(message) ?? looseTitle(message);
  if (!title) {
    return { indexes: [], reason: "missing_target", target: "matched" };
  }

  const indexes = draft.items
    .map((item, index) => (item.title.includes(title) || title.includes(item.title) ? index : -1))
    .filter((index) => index >= 0);

  if (indexes.length > 1) {
    return { indexes, reason: "ambiguous_target", target: "matched" };
  }

  return { indexes, reason: indexes.length === 0 ? "missing_target" : undefined, target: "matched" };
};

const withRevisionNote = (draft: ScheduleDraft): ScheduleDraft => ({
  ...draft,
  assumptions: unique([
    ...(draft.assumptions ?? []),
    "修改后的草案尚未重新检查已有日程冲突，准备创建时会再次检查。",
  ]),
  conflicts: unique([
    ...(draft.conflicts ?? []),
    "准备创建时会重新检查已有日程冲突。",
  ]),
});

const clarify = (draft: ScheduleDraft, question: string): ReviseScheduleDraftResult => ({
  appliedActions: [],
  clarificationQuestions: [question],
  draft,
  needsClarification: true,
  summary: question,
});

const updateItems = (
  draft: ScheduleDraft,
  indexes: number[],
  update: ParsedTimeUpdate,
): ScheduleDraftItem[] =>
  draft.items.map((item, index) =>
    indexes.includes(index)
      ? {
          ...item,
          ...(update.date ? { date: update.date } : {}),
          ...(update.startTime ? { startTime: update.startTime } : {}),
          ...(update.endTime ? { endTime: update.endTime } : {}),
          conflictNote: "已按用户要求手动调整；准备创建时会重新检查冲突。",
        }
      : item,
  );

export const reviseScheduleDraft = (
  input: ReviseScheduleDraftInput,
): ReviseScheduleDraftResult => {
  const draft = structuredClone(input.draft) as ScheduleDraft;
  const message = normalizeText(input.userMessage);

  if (/自动|避开冲突|找空闲/u.test(message)) {
    const note = "我可以记录你希望重新安排，但自动寻找空闲时间将在后续阶段实现。你可以指定新的日期或时间段。";

    return {
      appliedActions: [{ message: note, type: "note" }],
      draft,
      needsClarification: false,
      summary: note,
    };
  }

  if (/允许重叠|冲突也没关系|重叠安排/u.test(message)) {
    const nextDraft = withRevisionNote({
      ...draft,
      assumptions: unique([...(draft.assumptions ?? []), "用户已允许重叠安排冲突日程。"]),
      nextActions: unique([...(draft.nextActions ?? []), "准备创建日程"]),
    });

    return {
      appliedActions: [{ conflictPolicy: "allow-overlap", type: "set_conflict_policy" }],
      draft: nextDraft,
      needsClarification: false,
      summary: "已记录允许重叠。草案仍然尚未写入日程，准备创建时会重新检查冲突。",
    };
  }

  if (/冲突就跳过|跳过冲突/u.test(message)) {
    const nextDraft = withRevisionNote(draft);

    return {
      appliedActions: [{ conflictPolicy: "skip", type: "set_conflict_policy" }],
      draft: nextDraft,
      needsClarification: false,
      summary: "已记录冲突策略为跳过；L2 不会自动删除日程项，准备创建时会重新检查冲突。",
    };
  }

  const removing = /删除|移除|不要安排|先不要安排/u.test(message);
  const changingTime = /改到|调整到|放到|安排到/u.test(message);

  if (!removing && !changingTime) {
    return clarify(draft, "你想修改哪个日程项？可以说“把第 2 个任务改到明天上午”或“删除‘部署验证’”。");
  }

  const target = findTargetIndexes({ conflicts: input.conflicts, draft, message });
  if (target.reason === "ambiguous_target") {
    return clarify(draft, "我找到了多个同名日程项。请说明第几个，或提供更完整的任务标题。");
  }
  if (target.indexes.length === 0) {
    const question = target.reason === "no_conflicts"
      ? "当前没有可识别的冲突项。请指定要修改的日程项标题或序号。"
      : "我没有找到对应的日程项。请说明具体是哪一个，或用“第几个任务”来指代。";

    return clarify(draft, question);
  }

  if (removing) {
    const nextItems = draft.items.filter((_, index) => !target.indexes.includes(index));
    const removedTitles = target.indexes.map((index) => draft.items[index]?.title).filter((title): title is string => Boolean(title));
    const nextDraft = withRevisionNote({
      ...draft,
      items: nextItems,
      title: draft.title.replace(/\d+\s*项任务/u, `${nextItems.length} 项任务`),
    });

    return {
      appliedActions: removedTitles.map((itemTitle) => ({ itemTitle, type: "remove_item" })),
      draft: nextDraft,
      needsClarification: false,
      summary: `已从日程草案移除：${removedTitles.join("、")}。草案仍然尚未写入日程。`,
    };
  }

  const update = parseTimeUpdate(message, input.referenceDate);
  if (!hasUsefulTimeUpdate(update) || !isValidTimeUpdate(update)) {
    return clarify(draft, "我还不能确定新的日期或时间段。请给出类似“明天下午”或“20:00-22:00”的时间。");
  }

  const nextDraft = withRevisionNote({
    ...draft,
    items: updateItems(draft, target.indexes, update),
  });
  const itemTitles = target.indexes.map((index) => draft.items[index]?.title).filter((title): title is string => Boolean(title));

  return {
    appliedActions: [{
      date: update.date ?? null,
      endTime: update.endTime ?? null,
      itemTitle: target.target === "matched" ? itemTitles[0] ?? null : null,
      startTime: update.startTime ?? null,
      target: target.target,
      type: "update_time",
    }],
    draft: nextDraft,
    needsClarification: false,
    summary: `已更新日程草案：${itemTitles.join("、")}。草案仍然尚未写入日程，准备创建时会重新检查冲突。`,
  };
};
