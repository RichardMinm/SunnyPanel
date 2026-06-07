"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const startOffset = (firstDay.getUTCDay() + 6) % 7; // Mon=0
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

export function ScheduleMonthView({ onBackToWorkbench }: ScheduleMonthViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<ScheduleItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [selectedDate, setSelectedDate] = useState<null | string>(null);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/agent/schedule?month=${monthKey}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            typeof data?.message === "string" ? data.message : "加载失败",
          );
        }
        return res.json();
      })
      .then((data: { items: ScheduleItemSummary[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "加载日程失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItemSummary[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const goToPrevMonth = useCallback(() => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }, [month]);

  const goToNextMonth = useCallback(() => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }, [month]);

  const isCurrentMonth = (date: Date) => date.getUTCMonth() + 1 === month;
  const isToday = (date: Date) => formatDateKey(date) === formatDateKey(now);

  const selectedItems = selectedDate
    ? (itemsByDate.get(selectedDate) ?? [])
    : [];
  const priorityClass = (p: string) =>
    p === "high" ? "is-high" : p === "low" ? "is-low" : "";

  return (
    <div className="sunny-schedule-month-view">
      <div className="sunny-schedule-month-head">
        <button
          type="button"
          className="sunny-schedule-back-btn"
          onClick={onBackToWorkbench}
        >
          ← 返回工作台
        </button>
        <div className="sunny-schedule-month-nav">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="上个月"
          >
            ←
          </button>
          <h2>
            {year}年{month}月
          </h2>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="下个月"
          >
            →
          </button>
        </div>
        <span className="sunny-schedule-month-count">
          {loading
            ? "加载中..."
            : error
              ? `错误: ${error}`
              : `${items.length} 项日程`}
        </span>
      </div>

      <div className="sunny-schedule-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="sunny-schedule-weekday">
            {label}
          </div>
        ))}
        {days.map((date) => {
          const key = formatDateKey(date);
          const dayItems = itemsByDate.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              className={`sunny-schedule-day${isCurrentMonth(date) ? "" : " is-other-month"}${isToday(date) ? " is-today" : ""}${selectedDate === key ? " is-selected" : ""}`}
              onClick={() =>
                setSelectedDate(selectedDate === key ? null : key)
              }
            >
              <span className="sunny-schedule-day-num">
                {date.getUTCDate()}
              </span>
              {dayItems.length > 0 ? (
                <span className="sunny-schedule-day-dots">
                  {dayItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={`sunny-schedule-dot ${priorityClass(item.priority)}`}
                    />
                  ))}
                  {dayItems.length > 3 ? (
                    <span className="sunny-schedule-dot-more">
                      +{dayItems.length - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="sunny-schedule-day-detail">
          <h3>{selectedDate} 日程</h3>
          {selectedItems.length === 0 ? (
            <p className="sunny-schedule-empty-day">当天无日程安排</p>
          ) : (
            <ul className="sunny-schedule-item-list">
              {selectedItems.map((item) => (
                <li
                  key={item.id}
                  className={`sunny-schedule-item ${priorityClass(item.priority)}`}
                >
                  <span className="sunny-schedule-item-time">
                    {item.startTime
                      ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}`
                      : "全天"}
                  </span>
                  <span className="sunny-schedule-item-title">
                    {item.title}
                  </span>
                  <span
                    className={`sunny-schedule-item-status is-${item.status}`}
                  >
                    {item.status === "done"
                      ? "✓"
                      : item.status === "canceled"
                        ? "✗"
                        : "○"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
