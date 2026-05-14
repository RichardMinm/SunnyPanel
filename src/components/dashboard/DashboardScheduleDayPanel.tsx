import Link from "next/link";

import { EmptyState, StatusBadge } from "@/components/ui/SunnyComponents";
import { formatScheduleTimeRange, type ScheduleItemRecord } from "@/lib/schedule/items";

import { updateScheduleStatusAction } from "@/app/(site)/dashboard/schedule-actions";

import {
  planPriorityLabelMap,
  schedulePriorityToneMap,
  scheduleStatusLabelMap,
  scheduleStatusToneMap,
} from "./dashboard-page-constants";

const getScheduleRelationLabel = (item: ScheduleItemRecord) => {
  if (item.relatedPlan) {
    const title = typeof item.relatedPlan === "number" ? `计划 #${item.relatedPlan}` : item.relatedPlan.title;

    return title ? `计划：${title}` : "关联计划";
  }

  if (item.relatedChecklist) {
    const title = typeof item.relatedChecklist === "number" ? `清单 #${item.relatedChecklist}` : item.relatedChecklist.title;

    return title ? `清单：${title}` : "关联清单";
  }

  return item.sourceType === "agent" ? "Agent 安排" : "手动日程";
};

export function DashboardScheduleDayPanel({
  empty,
  items,
  kicker,
  title,
}: {
  empty: string;
  items: ScheduleItemRecord[];
  kicker: string;
  title: string;
}) {
  return (
    <div className="sunny-schedule-day-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="sunny-kicker text-[0.68rem] text-muted">{kicker}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
        </div>
        <span className="sunny-dashboard-count">{items.length} 项</span>
      </div>

      <div className="sunny-schedule-list mt-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="sunny-schedule-row">
              <div className="sunny-schedule-time">
                <strong>{formatScheduleTimeRange(item)}</strong>
                <span>{item.isAllDay ? "All day" : item.startTime && item.endTime ? "Time block" : "Flexible"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={scheduleStatusToneMap[item.status]}>{scheduleStatusLabelMap[item.status]}</StatusBadge>
                    <StatusBadge tone={schedulePriorityToneMap[item.priority]}>{planPriorityLabelMap[item.priority]}</StatusBadge>
                  </div>
                </div>
                <p className="sunny-dashboard-clamp mt-1 text-xs leading-5 text-muted">
                  {item.description || getScheduleRelationLabel(item)}
                </p>
                <p className="mt-1 text-xs text-muted">{getScheduleRelationLabel(item)}</p>
                {item.conflictNote ? <p className="sunny-schedule-conflict mt-2 text-xs">{item.conflictNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={updateScheduleStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className="sunny-gap-action-primary">
                      完成
                    </button>
                  </form>
                  <form action={updateScheduleStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value="skipped" />
                    <button type="submit" className="sunny-gap-action-secondary">
                      跳过
                    </button>
                  </form>
                  <Link href={`/admin/collections/schedule-items/${item.id}`} className="sunny-gap-action-secondary">
                    改期
                  </Link>
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState>{empty}</EmptyState>
        )}
      </div>
    </div>
  );
}
