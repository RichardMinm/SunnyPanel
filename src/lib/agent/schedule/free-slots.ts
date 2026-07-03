export type LocalBusyBlock = {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay?: boolean | null;
  title?: string | null;
  sourceId?: number | string | null;
};

export type LocalFreeSlot = {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
};

export type FindLocalFreeSlotsInput = {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  availableTimeWindows: Array<{
    day?: string | null;
    date?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  }>;
  busyBlocks: LocalBusyBlock[];
  durationMinutes: number;
  maxSuggestions?: number;
};

type TimeRange = {
  end: number;
  start: number;
};

const DEFAULT_MAX_SUGGESTIONS = 5;
const FREE_SLOT_REASON = "SunnyPanel 本地日程在该时间窗内没有占用。";
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

const timeToMinutes = (value: null | string | undefined): number | null => {
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

const normalizeWindow = (
  window: FindLocalFreeSlotsInput["availableTimeWindows"][number],
): (TimeRange & { date: string }) | null => {
  const date = normalizeDateKey(window.date ?? window.day);
  const start = timeToMinutes(window.startTime);
  const end = timeToMinutes(window.endTime);

  if (!date || start === null || end === null || start >= end) return null;

  return { date, end, start };
};

const dateWithinRange = (
  date: string,
  range: FindLocalFreeSlotsInput["dateRange"],
): boolean => {
  if (!range) return true;
  const start = normalizeDateKey(range.startDate);
  const end = normalizeDateKey(range.endDate);

  if (start && date < start) return false;
  if (end && date > end) return false;

  return true;
};

const busyRangeForWindow = (
  busy: LocalBusyBlock,
  window: TimeRange & { date: string },
): TimeRange | null => {
  if (normalizeDateKey(busy.date) !== window.date) return null;
  if (busy.isAllDay === true) return { end: window.end, start: window.start };

  const start = timeToMinutes(busy.startTime);
  const end = timeToMinutes(busy.endTime);

  // Treat incomplete local schedule-items as occupying the available window so suggestions stay conservative.
  if (start === null || end === null || start >= end) {
    return { end: window.end, start: window.start };
  }

  const clampedStart = Math.max(window.start, start);
  const clampedEnd = Math.min(window.end, end);
  if (clampedStart >= clampedEnd) return null;

  return { end: clampedEnd, start: clampedStart };
};

const mergeRanges = (ranges: TimeRange[]): TimeRange[] => {
  const sorted = ranges
    .map((range) => ({ ...range }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: TimeRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push(range);
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  return merged;
};

export const findLocalFreeSlots = (
  input: FindLocalFreeSlotsInput,
): LocalFreeSlot[] => {
  if (!Array.isArray(input.availableTimeWindows) || input.durationMinutes <= 0) {
    return [];
  }

  const maxSuggestions = Number.isFinite(input.maxSuggestions)
    ? Math.max(0, Math.floor(input.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS))
    : DEFAULT_MAX_SUGGESTIONS;
  if (maxSuggestions === 0) return [];

  const windows = input.availableTimeWindows
    .map(normalizeWindow)
    .filter((window): window is TimeRange & { date: string } => Boolean(window))
    .filter((window) => dateWithinRange(window.date, input.dateRange))
    .sort((left, right) => left.date.localeCompare(right.date) || left.start - right.start);
  const busyBlocks = Array.isArray(input.busyBlocks) ? input.busyBlocks : [];
  const freeSlots: LocalFreeSlot[] = [];

  for (const window of windows) {
    const busyRanges = mergeRanges(
      busyBlocks
        .map((busy) => busyRangeForWindow(busy, window))
        .filter((range): range is TimeRange => Boolean(range)),
    );
    let cursor = window.start;

    for (const busy of busyRanges) {
      if (busy.end <= cursor) continue;
      if (busy.start > cursor && busy.start - cursor >= input.durationMinutes) {
        freeSlots.push({
          date: window.date,
          durationMinutes: busy.start - cursor,
          endTime: minutesToTime(busy.start),
          reason: FREE_SLOT_REASON,
          startTime: minutesToTime(cursor),
        });
      }
      cursor = Math.max(cursor, busy.end);
    }

    if (window.end > cursor && window.end - cursor >= input.durationMinutes) {
      freeSlots.push({
        date: window.date,
        durationMinutes: window.end - cursor,
        endTime: minutesToTime(window.end),
        reason: FREE_SLOT_REASON,
        startTime: minutesToTime(cursor),
      });
    }

    if (freeSlots.length >= maxSuggestions) break;
  }

  return freeSlots.slice(0, maxSuggestions);
};
