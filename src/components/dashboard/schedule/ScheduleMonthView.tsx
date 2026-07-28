"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { AppButton } from "@/components/primitives/AppButton";
import { AppEmptyState } from "@/components/primitives/AppEmptyState";
import {
  createLatestRequestGuard,
  findExactNavigationTarget,
  LinkedObjectList,
  notifyDomainRefresh,
  useDomainRefresh,
  useLinkedObjectFocus,
  type LinkedObjectNavigationTarget,
} from "@/components/dashboard/linked-objects";
import type { ScheduleViewSummary } from "@/lib/core-linkage/contracts";
import { DashboardIcon } from "../icons";
import { DashboardStagger, DashboardStaggerItem } from "../motion/DashboardStagger";

type ScheduleMonthViewProps = {
  navigationGeneration?: number;
  navigationTarget?: Extract<
    LinkedObjectNavigationTarget,
    { type: "schedule" }
  > | null;
  onBackToWorkbench: () => void;
  threadId: null | number;
  isSubmitting?: boolean;
  onNewSchedule?: (date: string) => void;
};

/* ── Constants ── */

type ScheduleCategory = "agent" | "course" | "default" | "exam" | "plan_action" | "study";

const CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  course: "课程",
  study: "学习",
  plan_action: "计划",
  agent: "Agent",
  exam: "截止",
  default: "",
};

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

function sortScheduleItems(items: ScheduleViewSummary[]): ScheduleViewSummary[] {
  return [...items].sort((a, b) => {
    if (!a.startTime && !b.startTime) return a.title.localeCompare(b.title, "zh-CN");
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}

function statusLabel(status: string | null): string {
  if (status === "done") return "已完成";
  if (status === "canceled") return "已取消";
  if (status === "skipped") return "已跳过";
  return "计划中";
}

function statusPillClass(status: string | null): string {
  if (status === "done") return "is-done";
  if (status === "canceled" || status === "skipped") return "is-canceled";
  return "is-planned";
}

function formatTimeRange(item: ScheduleViewSummary): string {
  if (!item.startTime) return "全天";
  return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
}

function formatStartTime(item: ScheduleViewSummary): string {
  if (!item.startTime) return "—";
  return item.startTime.slice(0, 5);
}

function formatDuration(item: ScheduleViewSummary): string {
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

function inferCategory(item: ScheduleViewSummary): ScheduleCategory {
  if (item.category && item.category in CATEGORY_LABELS) {
    return item.category as ScheduleCategory;
  }
  if (item.sourceType === "agent") return "agent";
  if (item.sourceType === "plan") return "plan_action";
  if (item.sourceType === "checklist") return "study";
  const title = item.title;
  if (/考试|测验|截止|ddl|deadline|提交|交卷/.test(title)) return "exam";
  if (/课|课程|上课|课堂|讲座|讲/.test(title)) return "course";
  if (/学习|阅读|读书|练习|复习|作业|刷题|背/.test(title)) return "study";
  if (/计划|目标|里程碑|复盘|总结/.test(title)) return "plan_action";
  return "default";
}

/* ── Component ── */

export function ScheduleMonthView({
  navigationGeneration,
  navigationTarget = null,
  onBackToWorkbench: _onBackToWorkbench,
  isSubmitting,
  onNewSchedule,
}: ScheduleMonthViewProps) {
  void _onBackToWorkbench; // kept for prop compatibility, not used in new design
  const now = new Date();
  const todayKey = formatDateKey(now);
  const [year, setYear] = useState(
    navigationTarget ? Number(navigationTarget.date.slice(0, 4)) : now.getFullYear(),
  );
  const [month, setMonth] = useState(
    navigationTarget ? Number(navigationTarget.date.slice(5, 7)) : now.getMonth() + 1,
  );
  const [items, setItems] = useState<ScheduleViewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    navigationTarget?.date ?? todayKey,
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [completionPendingId, setCompletionPendingId] = useState<number | null>(null);
  const [completionError, setCompletionError] = useState<null | string>(null);
  const completionRequestRef = useRef<number | null>(null);
  const requestGuardRef =
    useRef<ReturnType<typeof createLatestRequestGuard> | null>(null);
  if (requestGuardRef.current == null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }
    setYear(Number(navigationTarget.date.slice(0, 4)));
    setMonth(Number(navigationTarget.date.slice(5, 7)));
    setSelectedDate(navigationTarget.date);
  }, [navigationGeneration, navigationTarget]);

  /* ── Data Fetching ── */

  const loadScheduleItems = useCallback(() => {
    const request = requestGuardRef.current?.begin();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/agent/schedule?month=${monthKey}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(typeof data?.message === "string" ? data.message : "加载失败");
        }

        const data = (await res.json()) as { items: ScheduleViewSummary[] };
        request?.commit(() => setItems(data.items ?? []));
      } catch (err) {
        request?.commit(() =>
          setError(err instanceof Error ? err.message : "加载日程失败"),
        );
      } finally {
        request?.commit(() => setLoading(false));
      }
    })();

    return () => request?.cancel();
  }, [monthKey]);

  useDomainRefresh("schedule", loadScheduleItems);

  useEffect(() => {
    return loadScheduleItems();
  }, [loadScheduleItems]);

  /* ── Derived State ── */

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  useEffect(() => {
    const keys = new Set(days.map(formatDateKey));
    if (!keys.has(selectedDate)) {
      setSelectedDate(pickDefaultDateForMonth(days, todayKey, month));
    }
  }, [days, month, selectedDate, todayKey]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleViewSummary[]>();
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
  const navigationScheduleCandidate = findExactNavigationTarget(
    items,
    navigationTarget?.id,
  );
  const navigationSchedule =
    navigationScheduleCandidate &&
    navigationScheduleCandidate.date.slice(0, 10) === navigationTarget?.date
      ? navigationScheduleCandidate
      : null;
  useEffect(() => {
    if (navigationTarget && !loading) {
      setExpandedId(navigationSchedule?.id ?? null);
    }
  }, [
    loading,
    navigationGeneration,
    navigationSchedule?.id,
    navigationTarget,
  ]);
  const navigationFocusRef = useLinkedObjectFocus<HTMLDivElement>(
    !loading &&
      Boolean(navigationSchedule) &&
      selectedDate === navigationTarget?.date,
    navigationSchedule
      ? `${navigationSchedule.id}:${navigationGeneration ?? 0}`
      : null,
  );

  /* ── Navigation ── */

  const goToToday = () => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
    setSelectedDate(formatDateKey(n));
  };

  const shiftMonth = (delta: number) => {
    setMonth((currentMonth) => {
      const nextMonth = currentMonth + delta;
      if (nextMonth < 1) { setYear((y) => y - 1); return 12; }
      if (nextMonth > 12) { setYear((y) => y + 1); return 1; }
      return nextMonth;
    });
  };

  const completeScheduleItem = async (itemId: number) => {
    if (completionRequestRef.current !== null) return;
    completionRequestRef.current = itemId;
    setCompletionPendingId(itemId);
    setCompletionError(null);

    try {
      const response = await fetch("/api/agent/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, status: "done" }),
      });
      const data = await response.json().catch(() => null) as {
        affectedDocuments?: unknown;
        item?: { id?: unknown; status?: unknown };
      } | null;
      const completedItem = data?.item;
      if (
        !response.ok
        || typeof completedItem?.id !== "number"
        || typeof completedItem.status !== "string"
        || !Array.isArray(data?.affectedDocuments)
      ) {
        throw new Error("schedule completion failed");
      }
      const completedItemId = completedItem.id;
      const completedStatus = completedItem.status;

      setItems((currentItems) => currentItems.map((currentItem) =>
        currentItem.id === completedItemId ? { ...currentItem, status: completedStatus } : currentItem,
      ));
      notifyDomainRefresh({
        affectedDocuments: data.affectedDocuments,
        reason: "completion",
      });
    } catch {
      setCompletionError("完成失败，请重试");
    } finally {
      completionRequestRef.current = null;
      setCompletionPendingId(null);
    }
  };

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
          <button type="button" className="sunny-schedule-btn-new" onClick={() => onNewSchedule?.(selectedDate)}>
            <DashboardIcon name="plus" />
            新建
          </button>
        </div>
      </header>

      {/* Loading / Error */}
      {loading && items.length === 0 && <p className="sunny-schedule-empty-day">加载中…</p>}
      {error && <p className="sunny-schedule-empty-day">错误：{error}</p>}

      {/* Main Layout */}
      {(!loading || items.length > 0) && (!error || items.length > 0) && (
        <DashboardStagger className="sunny-schedule-layout">
          {/* Calendar Grid */}
          <DashboardStaggerItem className="sunny-schedule-calendar-pane-wrap">
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
                    {dayItems.length > 0 ? (
                      <div className="sunny-schedule-day-chips">
                        {chips.map((item) => {
                          const cat = inferCategory(item);
                          return (
                            <span
                              key={item.id}
                              className={`sunny-schedule-event-chip cat-${cat}${item.priority === "high" ? " is-priority-high" : ""}`}
                            >
                              <span className="sunny-schedule-event-chip-dot" />
                              {item.title}
                            </span>
                          );
                        })}
                        {moreCount > 0 && (
                          <span className="sunny-schedule-chip-more">+{moreCount}</span>
                        )}
                      </div>
                    ) : isCurrentMonth(date) ? (
                      <span className="sunny-schedule-day-add-hint">+ 添加</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
          </DashboardStaggerItem>

          {/* Timeline Panel */}
          <DashboardStaggerItem className="sunny-schedule-agenda-pane-wrap">
          <aside className="sunny-schedule-agenda-pane" aria-label="当日安排">
            <div className="sunny-schedule-agenda-head">
              <h3>{formatAgendaDateLabel(selectedDate)}</h3>
              <span className="sunny-schedule-agenda-count">
                {selectedItems.length > 0 ? `${selectedItems.length} 项` : "暂无安排"}
              </span>
            </div>
            {completionError && <p className="sunny-schedule-empty-day" role="alert">{completionError}</p>}

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDate}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
              >
            {selectedItems.length === 0 ? (
              <AppEmptyState
                className="sunny-schedule-empty-state"
                compact
                icon={
                  <span className="sunny-schedule-empty-icon">
                    <DashboardIcon name="calendar" />
                  </span>
                }
                title="暂无日程"
                description="这一天还没有安排。"
                action={
                  <button
                    type="button"
                    className="sunny-schedule-empty-add-btn"
                    onClick={() => onNewSchedule?.(selectedDate)}
                  >
                    <DashboardIcon name="plus" />
                    添加日程
                  </button>
                }
              />
            ) : (
              <div className="sunny-schedule-timeline">
                {selectedItems.map((item, idx) => {
                  const isExpanded = expandedId === item.id;
                  const showConnector = idx < selectedItems.length - 1;
                  const nextItem = showConnector ? selectedItems[idx + 1] : null;
                  const isGap = nextItem && item.endTime && nextItem.startTime
                    ? nextItem.startTime.localeCompare(item.endTime) > 0
                    : false;
                  const cat = inferCategory(item);

                  return (
                    <div key={item.id}>
                      <div
                        className={`sunny-schedule-timeline-item${item.priority === "high" ? " is-priority-high" : ""}${item.status === "done" ? " is-done" : ""}`}
                        data-category={cat}
                      >
                        <span className="sunny-schedule-timeline-time">
                          {formatStartTime(item)}
                        </span>
                        <div
                          aria-current={navigationSchedule?.id === item.id ? "true" : undefined}
                          className={`sunny-schedule-timeline-card${isExpanded ? " is-expanded" : ""}${item.status === "done" ? " is-done" : ""}${item.status === "canceled" || item.status === "skipped" ? " is-canceled" : ""}`}
                          ref={navigationSchedule?.id === item.id ? navigationFocusRef : undefined}
                        >
                          <button
                            aria-expanded={isExpanded}
                            className="sunny-schedule-timeline-card-toggle"
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : item.id)
                            }
                          >
                            <span className="sunny-schedule-timeline-row">
                              <span className="sunny-schedule-timeline-title">{item.title}</span>
                              <span className={`sunny-schedule-status-pill ${statusPillClass(item.status)}`}>
                                {statusLabel(item.status)}
                              </span>
                            </span>
                            <span className="sunny-schedule-timeline-meta">
                              {formatDuration(item)}
                              {formatDuration(item) && item.priority === "high" ? " · " : ""}
                              {item.priority === "high" ? "高优先级" : ""}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="sunny-schedule-timeline-expand">
                              <p className="sunny-schedule-timeline-expand-time">{formatTimeRange(item)}</p>
                              {item.description && <p>{item.description}</p>}
                              <h4>关联对象</h4>
                              <LinkedObjectList
                                defaultExpanded
                                items={item.linkedObjects}
                              />
                              {item.relatedChecklistItemKey && (
                                <span className="sunny-schedule-timeline-link">
                                  <DashboardIcon name="layers" />
                                  清单项：{item.relatedChecklistItemKey}
                                </span>
                              )}
                              {item.conflictNote && (
                                <span className="sunny-schedule-timeline-link">
                                  <DashboardIcon name="layers" />
                                  冲突备注：{item.conflictNote}
                                </span>
                              )}
                              {item.sourceType && (
                                <span className="sunny-schedule-timeline-source">
                                  <DashboardIcon name="layers" />
                                  基于{sourceTypeLabel(item.sourceType)}创建
                                </span>
                              )}
                              <div className="sunny-schedule-timeline-card-actions">
                                {item.status !== "done" && (
                                  <AppButton
                                    className="sunny-schedule-timeline-action-btn is-complete"
                                    loading={completionPendingId === item.id}
                                    onClick={(e) => { e.stopPropagation(); void completeScheduleItem(item.id); }}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    完成
                                  </AppButton>
                                )}
                                <button
                                  type="button"
                                  className="sunny-schedule-timeline-action-btn"
                                  onClick={(e) => { e.stopPropagation(); }}
                                >
                                  编辑
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {showConnector && (
                        <div className={`sunny-schedule-timeline-connector${isGap ? " is-gap" : ""}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </aside>
          </DashboardStaggerItem>
        </DashboardStagger>
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
