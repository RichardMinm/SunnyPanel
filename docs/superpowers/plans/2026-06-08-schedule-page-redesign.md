# 日程页面 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将日程页面从开发者工具风格重构为 Apple Calendar / Notion Calendar 产品化风格

**Architecture:** 完全重写 `ScheduleMonthView.tsx`（产品化 Header + 月历 event chip + Timeline 面板）和 `sunny-dashboard-schedule.css`（硬编码色值），新增 5 个 SVG 图标，DashboardShell/StatusBar 小改

**Tech Stack:** React 19, TypeScript, CSS（无 token 变量，硬编码色值）

---

## File Map

```
修改:
├── icons.tsx                         新增 chevron-left/right, plus, clock, layers (Task 1)
├── sunny-dashboard-schedule.css      完全重写 (Task 2)
├── ScheduleMonthView.tsx             完全重写 (Task 3)
├── DashboardShell.tsx                日程模式隐藏 StatusBar (Task 4)
└── DashboardStatusBar.tsx            新增 Agent Toast prop (Task 4)
```

---

### Task 1: 新增 SVG 图标

**Files:** `src/components/dashboard/icons.tsx`

在 `DashboardIconName` 类型中添加 5 个新图标名，在 `ICON_PATHS` 对象中添加对应 SVG path。

追加到 `DashboardIconName` union type（`"timeline"` 之后加 `|` 分隔）:

```typescript
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "layers"
  | "plus";
```

追加到 `ICON_PATHS` 对象（`timeline` 条目之后）:

```typescript
  chevronLeft: (
    <path d="M13.5 4.5 7.5 10l6 5.5" />
  ),
  chevronRight: (
    <path d="M6.5 4.5 12.5 10l-6 5.5" />
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.25V10l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="M3 7.4 10 4l7 3.4" />
      <path d="M3 10.6 10 13l7-3.4" />
      <path d="M3 13.8 10 16l7-3.8" />
    </>
  ),
  plus: (
    <path d="M10 4.5v11M4.5 10h11" />
  ),
```

提交: `feat: add chevron/clock/layers/plus icons for schedule page`

---

### Task 2: CSS 完全重写

**Files:** `src/app/styles/sunny-dashboard-schedule.css`

用以下内容完全替换当前文件:

```css
/* ── Page Shell ── */
.sunny-schedule-month-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  padding: 24px 28px 20px;
  background: #f8fafc;
  overflow: hidden;
}

/* ── Header ── */
.sunny-schedule-month-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.sunny-schedule-head-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sunny-schedule-head-titles h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}

.sunny-schedule-head-subtitle {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  font-weight: 400;
}

.sunny-schedule-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sunny-schedule-btn-today {
  padding: 7px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.sunny-schedule-btn-today:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.sunny-schedule-btn-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #94a3b8;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sunny-schedule-btn-nav:hover {
  background: #f8fafc;
  color: #475569;
}

.sunny-schedule-btn-nav svg {
  width: 14px;
  height: 14px;
}

.sunny-schedule-month-label {
  min-width: 100px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  text-align: center;
  user-select: none;
}

.sunny-schedule-view-segmented {
  display: flex;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.sunny-schedule-view-segmented button {
  padding: 6px 12px;
  border: none;
  background: #fff;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sunny-schedule-view-segmented button:not(:last-child) {
  border-right: 1px solid #e2e8f0;
}

.sunny-schedule-view-segmented button.is-active {
  background: #e2e8f0;
  color: #0f172a;
}

.sunny-schedule-view-segmented button:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.sunny-schedule-btn-new {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: #1d4ed8;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.sunny-schedule-btn-new:hover {
  background: #1e40af;
}

.sunny-schedule-btn-new svg {
  width: 13px;
  height: 13px;
}

/* ── Layout ── */
.sunny-schedule-layout {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
  align-items: flex-start;
}

/* ── Calendar Pane ── */
.sunny-schedule-calendar-pane {
  flex: 1 1 0;
  min-width: 0;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: auto;
}

.sunny-schedule-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.sunny-schedule-weekday {
  padding: 6px 0;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-align: center;
}

.sunny-schedule-weekday.is-weekend {
  color: #cbd5e1;
}

.sunny-schedule-day {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-height: 96px;
  padding: 6px 7px;
  border-radius: 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}

.sunny-schedule-day:hover {
  background: #f8fafc;
}

.sunny-schedule-day.is-other-month {
  opacity: 0.35;
  pointer-events: none;
}

.sunny-schedule-day.is-today .sunny-schedule-day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1d4ed8;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.sunny-schedule-day.is-selected {
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px #bfdbfe;
}

.sunny-schedule-day-num {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  line-height: 1;
}

.sunny-schedule-day.is-selected .sunny-schedule-day-num {
  color: #1e40af;
  font-weight: 700;
}

/* ── Event Chips ── */
.sunny-schedule-day-chips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sunny-schedule-event-chip {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 500;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-schedule-event-chip.is-priority-high {
  background: #fef3c7;
  color: #92400e;
}

.sunny-schedule-day.is-selected .sunny-schedule-event-chip {
  background: #dbeafe;
  color: #1e40af;
}

.sunny-schedule-day.is-selected .sunny-schedule-event-chip.is-priority-high {
  background: #fef3c7;
  color: #92400e;
}

.sunny-schedule-chip-more {
  padding-left: 4px;
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
  line-height: 22px;
}

/* ── Agenda / Timeline Pane ── */
.sunny-schedule-agenda-pane {
  flex: 0 0 370px;
  min-width: 340px;
  max-width: 420px;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sunny-schedule-agenda-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.sunny-schedule-agenda-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.sunny-schedule-agenda-count {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

/* ── Timeline ── */
.sunny-schedule-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow: auto;
}

.sunny-schedule-timeline-item {
  display: flex;
  gap: 14px;
}

.sunny-schedule-timeline-time {
  flex: 0 0 48px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  padding-top: 2px;
  position: relative;
}

.sunny-schedule-timeline-time::after {
  content: "";
  position: absolute;
  right: -18px;
  top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #bfdbfe;
  border: 2px solid #eff6ff;
}

.sunny-schedule-timeline-item.is-priority-high .sunny-schedule-timeline-time::after {
  background: #fbbf24;
  border-color: #fef3c7;
}

.sunny-schedule-timeline-item.is-done .sunny-schedule-timeline-time::after {
  background: #22c55e;
  border-color: #dcfce7;
}

.sunny-schedule-timeline-connector {
  width: 2px;
  height: 16px;
  background: #f1f5f9;
  margin-left: 48px;
}

.sunny-schedule-timeline-connector.is-gap {
  height: 32px;
}

.sunny-schedule-timeline-card {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  margin-bottom: 4px;
  border-radius: 14px;
  border: 1px solid #f1f5f9;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.sunny-schedule-timeline-card:hover {
  border-color: #e2e8f0;
}

.sunny-schedule-timeline-card.is-expanded {
  background: #fff;
  border-color: #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.sunny-schedule-timeline-card.is-done {
  opacity: 0.6;
}

.sunny-schedule-timeline-card.is-done .sunny-schedule-timeline-title {
  text-decoration: line-through;
}

.sunny-schedule-timeline-card.is-canceled,
.sunny-schedule-timeline-card.is-skipped {
  border-style: dashed;
  opacity: 0.5;
}

.sunny-schedule-timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sunny-schedule-timeline-title {
  flex: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-schedule-timeline-meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: #94a3b8;
}

.sunny-schedule-timeline-expand {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}

.sunny-schedule-timeline-expand p {
  margin: 0;
}

.sunny-schedule-timeline-source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 10px;
  color: #94a3b8;
}

.sunny-schedule-timeline-source svg {
  width: 12px;
  height: 12px;
}

/* ── Status Pill ── */
.sunny-schedule-status-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.sunny-schedule-status-pill.is-planned {
  background: #f1f5f9;
  color: #64748b;
}

.sunny-schedule-status-pill.is-priority-high {
  background: #fef3c7;
  color: #92400e;
}

.sunny-schedule-status-pill.is-done {
  background: #dcfce7;
  color: #16a34a;
}

.sunny-schedule-status-pill.is-canceled,
.sunny-schedule-status-pill.is-skipped {
  background: #fee2e2;
  color: #dc2626;
}

/* ── Empty State ── */
.sunny-schedule-empty-day {
  margin: 0;
  padding: 32px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
}

/* ── Agent Toast ── */
.sunny-schedule-agent-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  font-size: 11px;
  color: #64748b;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}

.sunny-schedule-agent-toast-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  animation: sunny-agent-pulse 2s ease-in-out infinite;
}

@keyframes sunny-agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Responsive ── */
@media (max-width: 899px) {
  .sunny-schedule-month-view {
    padding: 16px 16px 12px;
    gap: 16px;
  }

  .sunny-schedule-month-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .sunny-schedule-head-actions {
    flex-wrap: wrap;
  }

  .sunny-schedule-layout {
    flex-direction: column;
    overflow: auto;
  }

  .sunny-schedule-calendar-pane {
    flex: none;
  }

  .sunny-schedule-agenda-pane {
    flex: none;
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .sunny-schedule-day {
    min-height: 72px;
  }
}
```

提交: `style: rewrite schedule page CSS for productized redesign`

---

### Task 3: ScheduleMonthView 组件完全重写

**Files:** `src/components/dashboard/schedule/ScheduleMonthView.tsx`

用以下内容完全替换当前文件:

```typescript
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

export function ScheduleMonthView({ onBackToWorkbench }: ScheduleMonthViewProps) {
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
      {loading && <div className="sunny-schedule-empty-day">加载中…</div>}
      {error && <div className="sunny-schedule-empty-day">错误：{error}</div>}

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
                    onClick={() => setSelectedDate(key)}
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
                                  基于
                                  {item.sourceType === "plan" ? "计划" : "Agent 对话"}
                                  创建
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
    </div>
  );
}
```

**关键设计决策：**
- `expandedId` state 控制单个卡片的展开/折叠（同一时间只有一个展开）
- 来源说明（sourceType）移入展开区域，不再默认显示
- 状态 pill 的文字用 `statusLabel` 统一，优先级高亮用 `is-priority-high` class
- Timeline 连接线间距根据相邻事件时间差动态切换（`is-gap`）

提交: `feat: rewrite ScheduleMonthView with productized header, event chips, and timeline panel`

---

### Task 4: DashboardShell + DashboardStatusBar 调整

**Files:**
- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/DashboardStatusBar.tsx`

**DashboardShell 改动**: 日程模式下不渲染 DashboardStatusBar。

在 `MainWorkspace` 渲染 schedule 时，传入 `isSchedule` 标记。最简单的方式：在 `DashboardShell` 中判断 `activeMode === "schedule"` 时不渲染 `<DashboardStatusBar>`。

```typescript
// 在 return 的 JSX 底部，将：
<DashboardStatusBar statusLabel={statusLabel} />

// 改为：
{activeMode !== "schedule" && (
  <DashboardStatusBar statusLabel={statusLabel} />
)}
```

**DashboardStatusBar 改动**: 无需修改。Agent Toast 由 `ScheduleMonthView` 内部自行渲染（当 `isSubmitting` 且有 `threadId` 时显示右下角 toast）。但 ScheduleMonthView 目前不接收 `isSubmitting` prop。

更好的方案：在 `ScheduleMonthView` 中通过 URL 查询或 prop 接收 `isSubmitting`。考虑到 `DashboardShell` 已有 `isSubmitting` prop，将它传给 `ScheduleMonthView`。

修改 `ScheduleMonthViewProps`:
```typescript
type ScheduleMonthViewProps = {
  onBackToWorkbench: () => void;
  threadId: null | number;
  isSubmitting?: boolean;
};
```

并在组件底部添加 Agent Toast（仅开发环境显示调试信息）:

```typescript
{isSubmitting && (
  <div className="sunny-schedule-agent-toast" role="status" aria-live="polite">
    <span className="sunny-schedule-agent-toast-dot" />
    Agent 工作中
    {process.env.NODE_ENV === "development" && " — DeepSeek V3 / main"}
  </div>
)}
```

在 `DashboardShell.tsx` 中将 `isSubmitting` 传给 `ScheduleMonthView`:

```typescript
<ScheduleMonthView
  onBackToWorkbench={() => setActiveMode("agent")}
  threadId={threadId}
  isSubmitting={isSubmitting}
/>
```

提交: `feat: hide status bar in schedule mode, add Agent toast to schedule view`

---

### Task 5: 最终验证

- [ ] **Step 1: ESLint**

```bash
npx eslint src/components/dashboard/schedule/ScheduleMonthView.tsx src/components/dashboard/icons.tsx src/components/dashboard/DashboardShell.tsx src/components/dashboard/DashboardStatusBar.tsx
```
Expected: 0 errors

- [ ] **Step 2: TypeScript**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: 提交**

```bash
git commit -m "chore: final lint and type check pass for schedule redesign"
```
