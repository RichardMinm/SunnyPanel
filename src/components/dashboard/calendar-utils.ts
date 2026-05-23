import type { ScheduleItemRecord } from "@/lib/schedule/items";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const sameYear = weekStart.getFullYear() === end.getFullYear();

  if (sameYear && sameMonth) {
    return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月`;
  }
  if (sameYear) {
    return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月 - ${end.getMonth() + 1}月`;
  }
  return `${weekStart.getFullYear()}/${weekStart.getMonth() + 1} - ${end.getFullYear()}/${end.getMonth() + 1}`;
}

export function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDays = (date.getTime() - firstDayOfYear.getTime()) / DAY_MS;
  return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
}

export function prevWeek(current: Date): Date {
  const d = new Date(current);
  d.setDate(d.getDate() - 7);
  return d;
}

export function nextWeek(current: Date): Date {
  const d = new Date(current);
  d.setDate(d.getDate() + 7);
  return d;
}

export const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function groupScheduleByDate(
  items: ScheduleItemRecord[],
  weekDates: Date[],
): Record<string, ScheduleItemRecord[]> {
  const grouped: Record<string, ScheduleItemRecord[]> = {};
  for (const d of weekDates) {
    grouped[formatDateKey(d)] = [];
  }
  for (const item of items) {
    const key = item.date.split("T")[0]!;
    if (grouped[key]) {
      grouped[key]!.push(item);
    }
  }
  return grouped;
}

export function getWeekSearchParam(weekStart: Date): string {
  return `week=${formatDateKey(weekStart)}`;
}

export function parseWeekParam(param: string | null): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [year, month, day] = param.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);

    if (!Number.isNaN(localDate.getTime())) {
      return getWeekStart(localDate);
    }
  }

  return getWeekStart(new Date());
}
