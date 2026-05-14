export type ScheduleConflictItem = {
  date: string;
  endTime?: null | string;
  id: number;
  isAllDay?: boolean | null;
  startTime?: null | string;
  status: "canceled" | "done" | "planned" | "skipped";
  title: string;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toScheduleDateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const isValidScheduleTime = (value?: null | string) => {
  if (!value) {
    return false;
  }

  return timePattern.test(value);
};

const timeToMinutes = (value?: null | string) => {
  if (!isValidScheduleTime(value)) {
    return null;
  }

  const normalized = value as string;
  const [hour = 0, minute = 0] = normalized.split(":").map(Number);

  return hour * 60 + minute;
};

const isAllDayRange = ({
  endTime,
  isAllDay,
  startTime,
}: {
  endTime?: null | string;
  isAllDay?: boolean | null;
  startTime?: null | string;
}) => Boolean(isAllDay) || !startTime || !endTime;

export const detectScheduleConflictsInList = <TItem extends ScheduleConflictItem>(
  items: TItem[],
  date: string,
  startTime?: null | string,
  endTime?: null | string,
  excludeId?: number,
) => {
  const targetDateKey = toScheduleDateKey(date);
  const nextIsAllDay = isAllDayRange({ endTime, startTime });
  const nextStart = timeToMinutes(startTime);
  const nextEnd = timeToMinutes(endTime);

  return items.filter((item) => {
    if (excludeId && item.id === excludeId) {
      return false;
    }

    if (item.status === "canceled" || toScheduleDateKey(item.date) !== targetDateKey) {
      return false;
    }

    const currentIsAllDay = isAllDayRange(item);

    if (nextIsAllDay || currentIsAllDay) {
      return true;
    }

    const currentStart = timeToMinutes(item.startTime);
    const currentEnd = timeToMinutes(item.endTime);

    if (nextStart === null || nextEnd === null || currentStart === null || currentEnd === null) {
      return false;
    }

    return nextStart < currentEnd && nextEnd > currentStart;
  });
};
