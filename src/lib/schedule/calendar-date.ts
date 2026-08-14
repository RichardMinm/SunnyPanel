const isoCalendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/u;

const createUtcCalendarDate = (
  year: number,
  month: number,
  day: number,
): Date | null => {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

export const parseScheduleCalendarDate = (
  value: string | Date,
): Date | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    const calendarMatch = normalized.match(isoCalendarDatePattern);

    if (calendarMatch) {
      return createUtcCalendarDate(
        Number(calendarMatch[1]),
        Number(calendarMatch[2]),
        Number(calendarMatch[3]),
      );
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;

    return createUtcCalendarDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
    );
  }

  if (Number.isNaN(value.getTime())) return null;

  return createUtcCalendarDate(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
};

export const addScheduleCalendarDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);

  return next;
};

export const toScheduleDateKey = (value: string | Date): string => {
  const date = parseScheduleCalendarDate(value);

  if (!date) {
    return typeof value === "string" ? value.trim().slice(0, 10) : "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};
