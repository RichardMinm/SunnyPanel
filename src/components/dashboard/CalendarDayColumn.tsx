import type { ScheduleItemRecord } from "@/lib/schedule/items";
import { CalendarItem } from "./CalendarItem";

type CalendarDayColumnProps = {
  date: Date;
  isToday: boolean;
  items: ScheduleItemRecord[];
};

export function CalendarDayColumn({ date, isToday, items }: CalendarDayColumnProps) {
  const day = date.getDate();
  const month = date.getMonth() + 1;

  return (
    <div className={`sunny-calendar-day flex min-h-[7.5rem] flex-col rounded-xl border p-2 ${isToday ? "is-today" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <span className={`sunny-calendar-day-label text-xs font-semibold ${isToday ? "is-today" : ""}`}>
          {month}/{day}
        </span>
        {isToday ? (
          <span className="sunny-calendar-today-badge rounded px-1.5 py-0.5 text-[10px] font-medium">
            今天
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="sunny-calendar-empty-label text-[11px]">空</span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          {items.map((item) => (
            <CalendarItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
