"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";

type TimelineEventSummary = {
  id: number;
  title: string;
  date: string;
  type: string;
  description?: string | null;
  relatedPlan?: { id: number; title: string } | null;
};

type TimelineViewProps = {
  onBackToWorkbench: () => void;
  threadId: number | null;
};

const TYPE_LABELS: Record<string, string> = {
  milestone: "里程碑",
  project: "项目",
  life: "生活",
};

const TYPE_DOT_CLASS: Record<string, string> = {
  milestone: "is-milestone",
  project: "is-project",
  life: "is-life",
};

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function groupByDate(events: TimelineEventSummary[]): Map<string, TimelineEventSummary[]> {
  const map = new Map<string, TimelineEventSummary[]>();
  for (const event of events) {
    const key = event.date?.slice(0, 10) || "";
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return map;
}

function formatDateLabel(dateKey: string): string {
  if (!dateKey) return "";
  const [, m, d] = dateKey.split("-").map(Number);
  return `${Number(m)}月${Number(d)}日`;
}

export function TimelineView({
  onBackToWorkbench: _onBackToWorkbench,
}: TimelineViewProps) {
  void _onBackToWorkbench; // kept for prop compatibility
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState<TimelineEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- data fetching pattern consistent with existing dashboard views */
    let cancelled = false;
    setLoading(true);

    fetch(`/api/agent/timeline?month=${monthKey}&limit=50`)
      .then(async (res) => {
        if (!res.ok) return { events: [] as TimelineEventSummary[] };
        return res.json() as Promise<{ events: TimelineEventSummary[] }>;
      })
      .then((data) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {
        // silent
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => { cancelled = true; };
  }, [monthKey]);

  const groupedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
    return groupByDate(sorted);
  }, [events]);

  const shiftMonth = (delta: number) => {
    setMonth((currentMonth) => {
      const nextMonth = currentMonth + delta;
      if (nextMonth < 1) { setYear((y) => y - 1); return 12; }
      if (nextMonth > 12) { setYear((y) => y + 1); return 1; }
      return nextMonth;
    });
  };

  return (
    <div className="sunny-timeline-view">
      {/* Header */}
      <header className="sunny-timeline-view-head">
        <div>
          <h1>时间线</h1>
          <p className="sunny-timeline-subtitle">回顾你的学习里程碑、项目进展与生活节点</p>
        </div>
        <div className="sunny-timeline-nav">
          <button
            type="button" className="sunny-schedule-btn-nav" aria-label="上个月"
            onClick={() => shiftMonth(-1)}
          >
            <DashboardIcon name="chevronLeft" />
          </button>
          <span className="sunny-timeline-month-label">
            {year}年{MONTH_NAMES[month - 1]}
          </span>
          <button
            type="button" className="sunny-schedule-btn-nav" aria-label="下个月"
            onClick={() => shiftMonth(1)}
          >
            <DashboardIcon name="chevronRight" />
          </button>
        </div>
      </header>

      {/* Timeline track */}
      <div className="sunny-timeline-track">
        {loading ? (
          <p className="sunny-schedule-empty-day">加载中…</p>
        ) : groupedEvents.size === 0 ? (
          <p className="sunny-schedule-empty-day">
            本月暂无时间线事件。
            <br />
            完成清单条目后会自动生成时间线节点。
          </p>
        ) : (
          Array.from(groupedEvents.entries()).map(([dateKey, dateEvents]) => (
            <div key={dateKey} className="sunny-timeline-date-group">
              {/* Date marker */}
              <div className="sunny-timeline-date-marker">
                <span className="sunny-timeline-date-dot" />
                <span className="sunny-timeline-date-label">{formatDateLabel(dateKey)}</span>
              </div>
              {/* Events */}
              <div className="sunny-timeline-date-events">
                {dateEvents.map((event, idx) => {
                  const isExpanded = expandedId === event.id;
                  const isLast = idx === dateEvents.length - 1;

                  return (
                    <div key={event.id} className="sunny-timeline-event-row">
                      <div className="sunny-timeline-event-line">
                        {!isLast && <div className="sunny-timeline-event-connector" />}
                      </div>
                      <button
                        type="button"
                        className={`sunny-timeline-event-card${isExpanded ? " is-expanded" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      >
                        <div className="sunny-timeline-event-head">
                          <span className={`sunny-timeline-event-dot ${TYPE_DOT_CLASS[event.type] ?? "is-project"}`} />
                          <span className="sunny-timeline-event-type">
                            {TYPE_LABELS[event.type] ?? "项目"}
                          </span>
                        </div>
                        <h3 className="sunny-timeline-event-title">{event.title}</h3>
                        {event.relatedPlan && (
                          <span className="sunny-timeline-event-plan">
                            关联 {event.relatedPlan.title}
                          </span>
                        )}
                        {isExpanded && event.description && (
                          <p className="sunny-timeline-event-desc">{event.description}</p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
