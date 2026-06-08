"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";

/* ── Types ── */

type ScheduleItemSummary = {
  id: number;
  title: string;
  date: string;
  startTime: null | string;
  endTime: null | string;
  status: string;
  priority: string;
  sourceType: string;
  planId: null | number;
  description: null | string;
};

type ScheduleMonthViewProps = {
  onBackToWorkbench: () => void;
  threadId: null | number;
  isSubmitting?: boolean;
};

/* ── Constants ── */

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/* ── Helpers ── */

function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const days: Date[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(firstDay);
    d.setUTCDate(d.getUTCDate() - (i + 1));
    days.push(d);
  }

  for (let d = 1; d <= lastDay.getUTCDate(); d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)));
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d);
    }
  }

  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatAgendaDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_NAMES[date.getUTCDay()] ?? "";
  return `${y}年${m}月${d}日 · ${weekday}`;
}

function sortScheduleItems(items: ScheduleItemSummary[]): ScheduleItemSummary[] {
  return [...items].sort((a, b) => {
    if (!a.startTime && !b.startTime) return a.title.localeCompare(b.title, "zh-CN");
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}

function statusLabel(status: string): string {
  if (status === "done") return "已完成";
  if (status === "canceled") return "已取消";
  if (status === "skipped") return "已跳过";
  return "计划中";
}

function statusPillClass(status: string): string {
  if (status === "done") return "is-done";
  if (status === "canceled" || status === "skipped") return "is-canceled";
  return "is-planned";
}

function formatTimeRange(item: ScheduleItemSummary): string {
  if (!item.startTime) return "全天";
  return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
}

function formatStartTime(item: ScheduleItemSummary): string {
  if (!item.startTime) return "—";
  return item.startTime.slice(0, 5);
}

function formatDuration(item: ScheduleItemSummary): string {
  if (!item.startTime || !item.endTime) return "";
  const [sh, sm] = item.startTime.split(":").map(Number);
  const [eh, em] = item.endTime.split(":").map(Number);
  const totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function pickDefaultDateForMonth(days: Date[], todayKey: string, targetMonth: number): string {
  const keys = new Set(days.map(formatDateKey));
  if (keys.has(todayKey)) return todayKey;
  const firstInMonth = days.find((day) => day.getUTCMonth() + 1 === targetMonth);
  return firstInMonth ? formatDateKey(firstInMonth) : formatDateKey(days[0]);
}

/* ── Component ── */

export function ScheduleMonthView({ onBackToWorkbench, isSubmitting }: ScheduleMonthViewProps) {
  const now = new Date();
  const todayKey = formatDateKey(now);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<ScheduleItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  /* ── Data Fetching ── */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/agent/schedule?month=${monthKey}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(typeof data?.message === "string" ? data.message : "加载失败");
        }
        return res.json();
      })
      .then((data: { items: ScheduleItemSummary[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载日程失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [monthKey]);

  /* ── Derived State ── */

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  useEffect(() => {
    const keys = new Set(days.map(formatDateKey));
    if (!keys.has(selectedDate)) {
      setSelectedDate(pickDefaultDateForMonth(days, todayKey, month));
    }
  }, [days, month, selectedDate, todayKey]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItemSummary[]>();
    for (const item of items) {
      const dateKey = typeof item.date === "string" ? item.date.slice(0, 10) : String(item.date ?? "").slice(0, 10);
      const list = map.get(dateKey) ?? [];
      list.push(item);
      map.set(dateKey, list);
    }
    return map;
  }, [items]);

  const selectedItems = useMemo(
    () => sortScheduleItems(selectedDate ? (itemsByDate.get(selectedDate) ?? []) : []),
    [itemsByDate, selectedDate],
  );

  /* ── Navigation ── */

  const goToToday = useCallback(() => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
    setSelectedDate(formatDateKey(n));
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    setMonth((currentMonth) => {
      let nextMonth = currentMonth + delta;
      if (nextMonth < 1) { setYear((y) => y - 1); return 12; }
      if (nextMonth > 12) { setYear((y) => y + 1); return 1; }
      return nextMonth;
    });
  }, []);

  /* ── Calendar Helpers ── */

  const isCurrentMonth = (date: Date) => date.getUTCMonth() + 1 === month;
  const isToday = (date: Date) => formatDateKey(date) === todayKey;
  const isWeekend = (idx: number) => idx >= 5;

  /* ── Render ── */

  return (
    <div className="sunny-schedule-month-view">
      {/* Header */}
      <header className="sunny-schedule-month-head">
        <div className="sunny-schedule-head-titles">
          <h1>日程安排</h1>
          <p className="sunny-schedule-head-subtitle">管理你的课程、学习计划与每日任务</p>
        </div>
        <div className="sunny-schedule-head-actions">
          <button type="button" className="sunny-schedule-btn-today" onClick={goToToday}>
            今天
          </button>
          <button
            type="button" className="sunny-schedule-btn-nav" aria-label="上个月"
            onClick={() => shiftMonth(-1)}
          >
            <DashboardIcon name="chevronLeft" />
          </button>
          <span className="sunny-schedule-month-label">{year}年{month}月</span>
          <button
            type="button" className="sunny-schedule-btn-nav" aria-label="下个月"
            onClick={() => shiftMonth(1)}
          >
            <DashboardIcon name="chevronRight" />
          </button>
          <div className="sunny-schedule-view-segmented">
            <button type="button" className="is-active">月</button>
            <button type="button" disabled>周</button>
            <button type="button" disabled>日</button>
          </div>
          <button type="button" className="sunny-schedule-btn-new">
            <DashboardIcon name="plus" />
            新建
          </button>
        </div>
      </header>

      {/* Loading / Error */}
      {loading && <p className="sunny-schedule-empty-day">加载中…</p>}
      {error && <p className="sunny-schedule-empty-day">错误：{error}</p>}

      {/* Main Layout */}
      {!loading && !error && (
        <div className="sunny-schedule-layout">
          {/* Calendar Grid */}
          <section className="sunny-schedule-calendar-pane" aria-label="月历">
            <div className="sunny-schedule-grid">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div key={label} className={`sunny-schedule-weekday${isWeekend(idx) ? " is-weekend" : ""}`}>
                  {label}
                </div>
              ))}
              {days.map((date) => {
                const key = formatDateKey(date);
                const dayItems = sortScheduleItems(itemsByDate.get(key) ?? []);
                const chips = dayItems.slice(0, 2);
                const moreCount = dayItems.length - chips.length;

                return (
                  <button
                    key={key}
                    type="button"
                    className={`sunny-schedule-day${isCurrentMonth(date) ? "" : " is-other-month"}${isToday(date) ? " is-today" : ""}${selectedDate === key ? " is-selected" : ""}`}
                    onClick={() => { setSelectedDate(key); setExpandedId(null); }}
                    aria-pressed={selectedDate === key}
                    aria-label={`${key}${dayItems.length > 0 ? `，${dayItems.length} 项日程` : ""}`}
                  >
                    <span className="sunny-schedule-day-num">{date.getUTCDate()}</span>
                    {dayItems.length > 0 && (
                      <div className="sunny-schedule-day-chips">
                        {chips.map((item) => (
                          <span
                            key={item.id}
                            className={`sunny-schedule-event-chip${item.priority === "high" ? " is-priority-high" : ""}`}
                          >
                            {item.title}
                          </span>
                        ))}
                        {moreCount > 0 && (
                          <span className="sunny-schedule-chip-more">+{moreCount}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Timeline Panel */}
          <aside className="sunny-schedule-agenda-pane" aria-label="当日安排">
            <div className="sunny-schedule-agenda-head">
              <h3>{formatAgendaDateLabel(selectedDate)}</h3>
              <span className="sunny-schedule-agenda-count">
                {selectedItems.length > 0 ? `${selectedItems.length} 项` : "暂无安排"}
              </span>
            </div>

            {selectedItems.length === 0 ? (
              <p className="sunny-schedule-empty-day">
                当天无日程安排。
                <br />
                可以从 Agent 对话中创建新日程。
              </p>
            ) : (
              <div className="sunny-schedule-timeline">
                {selectedItems.map((item, idx) => {
                  const isExpanded = expandedId === item.id;
                  const showConnector = idx < selectedItems.length - 1;
                  const nextItem = showConnector ? selectedItems[idx + 1] : null;
                  const isGap = nextItem && item.endTime && nextItem.startTime
                    ? nextItem.startTime.localeCompare(item.endTime) > 0
                    : false;

                  return (
                    <div key={item.id}>
                      <div className={`sunny-schedule-timeline-item${item.priority === "high" ? " is-priority-high" : ""}${item.status === "done" ? " is-done" : ""}`}>
                        <span className="sunny-schedule-timeline-time">
                          {formatStartTime(item)}
                        </span>
                        <button
                          type="button"
                          className={`sunny-schedule-timeline-card${isExpanded ? " is-expanded" : ""}${item.status === "done" ? " is-done" : ""}${item.status === "canceled" || item.status === "skipped" ? " is-canceled" : ""}`}
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        >
                          <div className="sunny-schedule-timeline-row">
                            <span className="sunny-schedule-timeline-title">{item.title}</span>
                            {item.priority === "high" ? (
                              <span className="sunny-schedule-status-pill is-priority-high">高优先级</span>
                            ) : (
                              <span className={`sunny-schedule-status-pill ${statusPillClass(item.status)}`}>
                                {statusLabel(item.status)}
                              </span>
                            )}
                          </div>
                          <p className="sunny-schedule-timeline-meta">
                            {formatTimeRange(item)}
                            {formatDuration(item) ? ` · ${formatDuration(item)}` : ""}
                          </p>
                          {isExpanded && (
                            <div className="sunny-schedule-timeline-expand">
                              {item.description && <p>{item.description}</p>}
                              {item.sourceType && (
                                <span className="sunny-schedule-timeline-source">
                                  <DashboardIcon name="layers" />
                                  基于{sourceTypeLabel(item.sourceType)}创建
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      </div>
                      {showConnector && (
                        <div className={`sunny-schedule-timeline-connector${isGap ? " is-gap" : ""}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Agent Toast */}
      {isSubmitting && (
        <div className="sunny-schedule-agent-toast" role="status" aria-live="polite">
          <span className="sunny-schedule-agent-toast-dot" />
          Agent 工作中
          {process.env.NODE_ENV === "development" && (
            <> — DeepSeek V3 / main</>
          )}
        </div>
      )}
    </div>
  );
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "plan") return "计划";
  if (sourceType === "agent") return "Agent 对话";
  if (sourceType === "manual") return "手动";
  return sourceType;
}
