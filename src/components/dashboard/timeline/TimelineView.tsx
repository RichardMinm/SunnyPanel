"use client";

import { useEffect, useMemo, useState } from "react";

import { categoryDotClass, type CategoryId } from "@/lib/category-styles";
import { AppEmptyState } from "@/components/primitives/AppEmptyState";
import {
  findExactNavigationTarget,
  useLinkedObjectFocus,
  type LinkedObjectNavigationTarget,
} from "@/components/dashboard/linked-objects";
import { DashboardIcon } from "../icons";
import { DashboardStagger, DashboardStaggerItem } from "../motion/DashboardStagger";

type TimelineEventSummary = {
  id: number;
  title: string;
  date: string;
  type: string;
  description?: string | null;
  sourceType?: string | null;
};

type TimelineViewProps = {
  navigationTarget?: Extract<
    LinkedObjectNavigationTarget,
    { type: "timeline" }
  > | null;
  onBackToWorkbench: () => void;
  onModeChange?: (mode: string) => void;
  onNewTimelineEvent?: () => void;
  threadId: number | null;
};

/* ── Type Config ── */

type TimelineType = "agent" | "exam" | "life" | "milestone" | "project" | "study";

const TYPE_CONFIG: Record<TimelineType, { label: string; category: CategoryId }> = {
  study: { label: "学习", category: "study" },
  project: { label: "项目", category: "plan" },
  life: { label: "生活", category: "default" },
  exam: { label: "考试", category: "exam" },
  agent: { label: "Agent", category: "agent" },
  milestone: { label: "里程碑", category: "default" },
};

const ALL_TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "全部" },
  { key: "study", label: "学习" },
  { key: "project", label: "项目" },
  { key: "life", label: "生活" },
  { key: "exam", label: "考试" },
  { key: "agent", label: "Agent" },
];

const SOURCE_LABELS: Record<string, string> = {
  checklist: "清单",
  schedule: "日程",
  plan: "计划",
  manual: "手动",
  agent: "Agent",
};

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

/* ── Helpers ── */

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

function getTypeConfig(type: string): { label: string; category: CategoryId } {
  return TYPE_CONFIG[type as TimelineType] ?? TYPE_CONFIG.milestone;
}

/* ── Component ── */

export function TimelineView({
  navigationTarget = null,
  onBackToWorkbench: _onBackToWorkbench,
  onModeChange,
  onNewTimelineEvent,
}: TimelineViewProps) {
  void _onBackToWorkbench;
  const now = new Date();
  const [year, setYear] = useState(
    navigationTarget ? Number(navigationTarget.date.slice(0, 4)) : now.getFullYear(),
  );
  const [month, setMonth] = useState(
    navigationTarget ? Number(navigationTarget.date.slice(5, 7)) : now.getMonth() + 1,
  );
  const [events, setEvents] = useState<TimelineEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- linked navigation synchronizes the exact destination month and an inclusive filter */
    setYear(Number(navigationTarget.date.slice(0, 4)));
    setMonth(Number(navigationTarget.date.slice(5, 7)));
    setTypeFilter("all");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [navigationTarget]);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- month changes begin a fresh timeline load */
    setLoading(true);

    fetch(`/api/agent/timeline?month=${monthKey}&limit=50`)
      .then(async (res) => {
        if (!res.ok) return { events: [] as TimelineEventSummary[] };
        return res.json() as Promise<{ events: TimelineEventSummary[] }>;
      })
      .then((data) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => { /* silent */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [monthKey]);

  const filteredEvents = useMemo(() => {
    if (typeFilter === "all") return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);
  const navigationTimelineCandidate = findExactNavigationTarget(
    events,
    navigationTarget?.id,
  );
  const navigationTimeline =
    navigationTimelineCandidate &&
    navigationTimelineCandidate.date.slice(0, 10) === navigationTarget?.date
      ? navigationTimelineCandidate
      : null;
  useEffect(() => {
    if (navigationTarget && !loading) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- select the exact dated target only after its month is available */
      setExpandedId(navigationTimeline?.id ?? null);
    }
  }, [loading, navigationTarget, navigationTimeline?.id]);
  const navigationFocusRef = useLinkedObjectFocus<HTMLButtonElement>(
    !loading && Boolean(navigationTimeline) && typeFilter === "all",
    navigationTimeline?.id ?? null,
  );

  const groupedEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => b.date.localeCompare(a.date));
    return groupByDate(sorted);
  }, [filteredEvents]);

  const shiftMonth = (delta: number) => {
    setLoading(true);
    setMonth((currentMonth) => {
      const nextMonth = currentMonth + delta;
      if (nextMonth < 1) { setYear((y) => y - 1); return 12; }
      if (nextMonth > 12) { setYear((y) => y + 1); return 1; }
      return nextMonth;
    });
  };

  const renderDateGroup = (dateKey: string, dateEvents: TimelineEventSummary[]) => (
    <div className="sunny-timeline-date-group">
      <div className="sunny-timeline-date-marker">
        <span className="sunny-timeline-date-dot" />
        <span className="sunny-timeline-date-label">{formatDateLabel(dateKey)}</span>
      </div>
      <div className="sunny-timeline-date-events">
        {dateEvents.map((event, idx) => {
          const isExpanded = expandedId === event.id;
          const isLast = idx === dateEvents.length - 1;
          const typeCfg = getTypeConfig(event.type);

          return (
            <div key={event.id} className="sunny-timeline-event-row">
              <div className="sunny-timeline-event-line">
                {!isLast && <div className="sunny-timeline-event-connector" />}
              </div>
              <button
                aria-current={navigationTimeline?.id === event.id ? "true" : undefined}
                aria-expanded={isExpanded}
                type="button"
                className={`sunny-timeline-event-card${isExpanded ? " is-expanded" : ""}`}
                onClick={() =>
                  setExpandedId(isExpanded ? null : event.id)
                }
                ref={navigationTimeline?.id === event.id ? navigationFocusRef : undefined}
              >
                <div className="sunny-timeline-event-head">
                  <span
                    className={`sunny-timeline-event-dot ${categoryDotClass}`}
                    data-category={typeCfg.category}
                  />
                  <span className="sunny-timeline-event-type">{typeCfg.label}</span>
                  {event.sourceType && (
                    <span className="sunny-timeline-event-source">
                      {SOURCE_LABELS[event.sourceType] ?? event.sourceType}
                    </span>
                  )}
                </div>
                <h3 className="sunny-timeline-event-title">{event.title}</h3>
                {isExpanded && (
                  <div className="sunny-timeline-event-detail">
                    {event.description && <p>{event.description}</p>}
                    {event.sourceType && (
                      <span className="sunny-timeline-event-source-detail">
                        来源：{SOURCE_LABELS[event.sourceType] ?? event.sourceType}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="sunny-timeline-view">
      {/* Header */}
      <header className="sunny-timeline-view-head">
        <div className="sunny-timeline-head-left">
          <h1>时间线</h1>
          <p className="sunny-timeline-subtitle">回顾你的学习里程碑、项目进展与生活节点</p>
        </div>
        <div className="sunny-timeline-head-right">
          <div className="sunny-timeline-nav">
            <button type="button" className="sunny-schedule-btn-nav" aria-label="上个月" onClick={() => shiftMonth(-1)}>
              <DashboardIcon name="chevronLeft" />
            </button>
            <span className="sunny-timeline-month-label">{year}年{MONTH_NAMES[month - 1]}</span>
            <button type="button" className="sunny-schedule-btn-nav" aria-label="下个月" onClick={() => shiftMonth(1)}>
              <DashboardIcon name="chevronRight" />
            </button>
          </div>
          <button type="button" className="sunny-schedule-btn-new" onClick={() => onNewTimelineEvent?.()}>
            <DashboardIcon name="plus" /> 添加节点
          </button>
        </div>
      </header>

      {/* Type Filter Tabs */}
      <div className="sunny-timeline-filter-tabs">
        {ALL_TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`sunny-timeline-filter-btn${typeFilter === f.key ? " is-active" : ""}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.key !== "all" && (
              <span className={`sunny-timeline-filter-dot ${categoryDotClass}`} data-category={f.key === "all" ? "default" : getTypeConfig(f.key).category} />
            )}
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline track */}
      <DashboardStagger className="sunny-timeline-track">
        {loading ? (
          <p className="sunny-schedule-empty-day">加载中…</p>
        ) : groupedEvents.size === 0 ? (
          <AppEmptyState
            className="sunny-timeline-empty-state"
            icon={
              <span className="sunny-timeline-empty-icon">
                <DashboardIcon name="calendar" />
              </span>
            }
            title="本月暂无时间线事件"
            description={
              <>
                完成清单、推进计划、结束日程或记录事件时，
                <br />
                对应节点会自动进入时间线。
              </>
            }
            action={
              <div className="sunny-timeline-empty-actions">
                <button type="button" className="sunny-schedule-empty-add-btn" onClick={() => onModeChange?.("checklist")}>
                  <DashboardIcon name="checklist" /> 查看清单
                </button>
                <button type="button" className="sunny-schedule-btn-new" onClick={() => onNewTimelineEvent?.()}>
                  <DashboardIcon name="plus" /> 添加里程碑
                </button>
              </div>
            }
          />
        ) : (
          Array.from(groupedEvents.entries()).map(([dateKey, dateEvents], index) =>
            index < 6 ? (
              <DashboardStaggerItem key={dateKey}>
                {renderDateGroup(dateKey, dateEvents)}
              </DashboardStaggerItem>
            ) : (
              <div key={dateKey}>{renderDateGroup(dateKey, dateEvents)}</div>
            ),
          )
        )}
      </DashboardStagger>
    </div>
  );
}
