import type { ScheduleItemRecord } from "@/lib/schedule/items";
import { formatScheduleTimeRange } from "@/lib/schedule/items";

const statusLabelMap: Record<string, string> = {
  planned: "待办",
  done: "已完成",
  skipped: "已跳过",
  canceled: "已取消",
};

type CalendarItemProps = {
  item: ScheduleItemRecord;
};

export function CalendarItem({ item }: CalendarItemProps) {
  const timeLabel = formatScheduleTimeRange(item);
  const isDone = item.status === "done";
  const isCanceled = item.status === "canceled" || item.status === "skipped";
  const priorityClass = item.priority === "high" ? "priority-high" : item.priority === "medium" ? "priority-medium" : "priority-low";

  return (
    <div
      className={`sunny-calendar-item group relative rounded-lg border px-2.5 py-2 text-sm leading-snug transition ${
        isCanceled ? "is-canceled" : isDone ? "is-done" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`sunny-calendar-item-dot inline-block h-2 w-2 shrink-0 rounded-full ${isDone ? "is-done" : priorityClass}`} />
        <span className={`min-w-0 flex-1 truncate font-medium ${isDone ? "is-done" : ""}`}>
          {item.title}
        </span>
        {!isDone && !isCanceled ? (
          <span className="shrink-0 text-[10px] text-muted">{statusLabelMap[item.status] ?? item.status}</span>
        ) : null}
      </div>

      <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted">
        <span className="shrink-0">{timeLabel}</span>
        {item.description ? (
          <span className="min-w-0 truncate">— {item.description}</span>
        ) : null}
      </div>

      {item.conflictNote ? (
        <div className="sunny-calendar-item-conflict mt-1 text-[11px]">{item.conflictNote}</div>
      ) : null}
    </div>
  );
}
