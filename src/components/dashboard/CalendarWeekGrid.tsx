import type { ScheduleItemRecord } from "@/lib/schedule/items";
import { CalendarDayColumn } from "./CalendarDayColumn";
import { DAY_LABELS, formatDateKey, getWeekDates, groupScheduleByDate, isSameDay } from "./calendar-utils";

type CalendarWeekGridProps = {
  items: ScheduleItemRecord[];
  today: Date;
  weekStart: Date;
};

export function CalendarWeekGrid({ items, today, weekStart }: CalendarWeekGridProps) {
  const weekDates = getWeekDates(weekStart);
  const grouped = groupScheduleByDate(items, weekDates);

  return (
    <div className="sunny-calendar-week-scroll">
      <div className="sunny-calendar-week-grid grid grid-cols-7 gap-1.5 md:gap-2">
        {weekDates.map((date, i) => (
          <div key={formatDateKey(date)} className="flex min-w-0 flex-col gap-1">
            <div className="sunny-calendar-weekday-label text-center text-[11px] font-medium">
              {DAY_LABELS[i]}
            </div>
            <CalendarDayColumn
              date={date}
              isToday={isSameDay(date, today)}
              items={grouped[formatDateKey(date)] ?? []}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
