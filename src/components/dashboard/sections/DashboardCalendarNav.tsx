"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { formatDateKey, nextWeek, prevWeek } from "@/components/dashboard/calendar-utils";
import { buildDashboardHref } from "@/lib/dashboard/dashboard-href";

type DashboardCalendarNavProps = {
  className?: string;
  compact?: boolean;
  weekStart: Date;
};

export function DashboardCalendarNav({ className, compact, weekStart }: DashboardCalendarNavProps) {
  const searchParams = useSearchParams();
  const threadParam = searchParams.get("threadId");
  const threadId = threadParam && Number.isFinite(Number(threadParam)) ? Number(threadParam) : undefined;

  const prevHref = buildDashboardHref({ threadId, week: prevWeek(weekStart) });
  const nextHref = buildDashboardHref({ threadId, week: nextWeek(weekStart) });
  const todayHref = buildDashboardHref({ threadId, week: formatDateKey(new Date()) });

  if (compact) {
    return (
      <div className={className ?? "flex flex-wrap items-center gap-1 mb-2"}>
        <Link className="sunny-calendar-nav-btn rounded px-2 py-1 text-xs font-medium transition" href={prevHref}>
          ←
        </Link>
        <Link className="sunny-calendar-nav-btn rounded px-2 py-1 text-xs font-medium transition" href={todayHref}>
          今天
        </Link>
        <Link className="sunny-calendar-nav-btn rounded px-2 py-1 text-xs font-medium transition" href={nextHref}>
          →
        </Link>
        <Link className="sunny-calendar-nav-link ml-auto text-xs transition" href="/admin/collections/schedule-items">
          管理
        </Link>
      </div>
    );
  }

  return (
    <div className={className ?? "sunny-calendar-nav flex flex-wrap items-center justify-end gap-1"}>
      <Link className="sunny-calendar-nav-btn rounded-lg px-2.5 py-1.5 text-xs font-medium transition" href={prevHref}>
        ← 上一周
      </Link>
      <Link className="sunny-calendar-nav-btn rounded-lg px-2.5 py-1.5 text-xs font-medium transition" href={todayHref}>
        今天
      </Link>
      <Link className="sunny-calendar-nav-btn rounded-lg px-2.5 py-1.5 text-xs font-medium transition" href={nextHref}>
        下一周 →
      </Link>
      <Link className="sunny-calendar-nav-link ml-1 text-xs transition" href="/admin/collections/schedule-items">
        管理
      </Link>
    </div>
  );
}
