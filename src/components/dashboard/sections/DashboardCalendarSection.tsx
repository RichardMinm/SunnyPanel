import { Suspense } from "react";

import { CalendarWeekGrid } from "@/components/dashboard/CalendarWeekGrid";
import {
  formatWeekRange,
  getWeekNumber,
  formatDateKey,
} from "@/components/dashboard/calendar-utils";
import { formatScheduleTimeRange, type WeekSchedule } from "@/lib/schedule/items";
import { DashboardCalendarNav } from "@/components/dashboard/sections/DashboardCalendarNav";
import { SectionHeader } from "@/components/ui/SunnyComponents";

type DashboardCalendarSectionProps = {
  compact?: boolean;
  today: Date;
  weekSchedule: WeekSchedule;
  weekStart: Date;
};

export function DashboardCalendarSection({
  compact,
  today,
  weekSchedule,
  weekStart,
}: DashboardCalendarSectionProps) {
  const weekLabel = formatWeekRange(weekStart);
  const weekNum = getWeekNumber(weekStart);

  const allItems = Object.values(weekSchedule).flat();
  const todayKey = formatDateKey(today);
  const todayItems = weekSchedule[todayKey] ?? [];
  const upcomingItems = Object.entries(weekSchedule)
    .filter(([date]) => date >= todayKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3);

  if (compact) {
    return (
      <details className="sunny-collapsible-card" open>
        <summary>日历 · 第{weekNum}周（{allItems.length}条）</summary>
        <div className="sunny-collapsible-body">
          <Suspense fallback={<div className="mb-2 h-7 animate-pulse rounded bg-white/40" />}>
            <DashboardCalendarNav compact weekStart={weekStart} />
          </Suspense>
          {todayItems.length > 0 ? (
            <div className="mb-2">
              <p className="text-xs font-semibold text-foreground mb-1">今天</p>
              <ul className="space-y-1">
                {todayItems.slice(0, 5).map((item) => {
                  const timeLabel = formatScheduleTimeRange(item);
                  return (
                  <li key={item.id} className="text-xs text-muted truncate">
                    {timeLabel ? <span className="font-medium text-foreground">{timeLabel}</span> : null}
                    {timeLabel ? " " : ""}{item.title}
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {upcomingItems.filter(([date]) => date > todayKey).map(([date, items]) => (
            <div key={date} className="mb-2">
              <p className="text-xs font-semibold text-foreground mb-1">{date.slice(5)}</p>
              <ul className="space-y-1">
                {items.slice(0, 4).map((item) => {
                  const timeLabel = formatScheduleTimeRange(item);
                  return (
                  <li key={item.id} className="text-xs text-muted truncate">
                    {timeLabel ? <span className="font-medium text-foreground">{timeLabel}</span> : null}
                    {timeLabel ? " " : ""}{item.title}
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {allItems.length === 0 ? <p className="text-xs text-muted">本周暂无日程</p> : null}
        </div>
      </details>
    );
  }

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-calendar-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader
          kicker="日历"
          title={`第${weekNum}周 · ${weekLabel}`}
          description={`${allItems.length} 条日程`}
        />

        <Suspense fallback={<div className="h-8 animate-pulse rounded bg-white/40" />}>
          <DashboardCalendarNav weekStart={weekStart} />
        </Suspense>
      </div>

      <div className="mt-4">
        <CalendarWeekGrid items={allItems} today={today} weekStart={weekStart} />
      </div>
    </section>
  );
}
