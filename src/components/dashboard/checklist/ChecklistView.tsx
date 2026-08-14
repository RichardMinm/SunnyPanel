"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createNavigationApplicationTracker,
  createRetainedDomainRequestRunner,
  findExactNavigationTarget,
  LinkedObjectList,
  useDomainRefresh,
  useLinkedObjectFocus,
  type DomainLoadMode,
  type LinkedObjectNavigationTarget,
} from "@/components/dashboard/linked-objects";
import type { ChecklistViewSummary } from "@/lib/core-linkage/contracts";
import { DashboardStagger, DashboardStaggerItem } from "../motion/DashboardStagger";

type ChecklistViewProps = {
  navigationGeneration?: number;
  navigationTarget?: Extract<
    LinkedObjectNavigationTarget,
    { type: "checklist" }
  > | null;
  onBackToWorkbench: () => void;
  threadId: number | null;
};

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "archived", label: "已归档" },
];

export function ChecklistView({
  navigationGeneration,
  navigationTarget = null,
  onBackToWorkbench: _onBackToWorkbench,
}: ChecklistViewProps) {
  void _onBackToWorkbench; // kept for prop compatibility
  const [checklists, setChecklists] = useState<ChecklistViewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const requestRunnerRef = useRef(createRetainedDomainRequestRunner());
  const navigationApplicationRef = useRef(
    createNavigationApplicationTracker(),
  );

  useEffect(() => {
    if (navigationTarget) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- linked navigation must load an unfiltered set that can contain the exact target */
      setFilter("");
    }
  }, [navigationGeneration, navigationTarget]);

  const fetchChecklists = useCallback((mode: DomainLoadMode) =>
    requestRunnerRef.current.run({
      clearError: () => setError(null),
      load: async () => {
        const params = new URLSearchParams();
        if (filter) params.set("status", filter);
        params.set("limit", "20");
        const res = await fetch(
          `/api/agent/checklist?${params.toString()}`,
        );
        if (!res.ok) {
          throw new Error("加载失败");
        }

        const data = (await res.json()) as {
          checklists: ChecklistViewSummary[];
        };
        return data.checklists ?? [];
      },
      mode,
      onData: setChecklists,
      onError: () => setError("刷新失败，请重试"),
      setForegroundLoading: setLoading,
    }), [filter]);

  useDomainRefresh("checklists", fetchChecklists);

  useEffect(() => {
    return fetchChecklists("foreground");
  }, [fetchChecklists]);

  const navigationChecklist = findExactNavigationTarget(
    checklists,
    navigationTarget?.id,
  );
  const navigationRequestKey = navigationTarget
    ? `checklist:${navigationTarget.id}:${navigationGeneration ?? 0}`
    : null;
  const navigationChecklistId = navigationChecklist?.id ?? null;
  useEffect(() => {
    if (
      navigationApplicationRef.current.shouldApply(
        navigationRequestKey,
        Boolean(navigationTarget && navigationChecklistId && !loading),
      )
    ) {
      setExpandedId(navigationChecklistId);
    }
  }, [
    loading,
    navigationChecklistId,
    navigationRequestKey,
    navigationTarget,
  ]);
  const navigationFocusRef = useLinkedObjectFocus<HTMLDivElement>(
    !loading && Boolean(navigationChecklist),
    navigationChecklist
      ? `${navigationChecklist.id}:${navigationGeneration ?? 0}`
      : null,
  );

  return (
    <div className="sunny-checklist-view">
      {/* Header */}
      <header className="sunny-checklist-view-head">
        <div>
          <h1>清单</h1>
          <p className="sunny-checklist-subtitle">追踪你的学习进度、任务与知识点掌握情况</p>
        </div>
        <div className="sunny-checklist-filter-bar">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? "is-active" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* Checklist cards */}
      <DashboardStagger className="sunny-checklist-card-list">
        {error ? (
          <p className="sunny-schedule-empty-day" role="alert">{error}</p>
        ) : null}
        {loading && checklists.length === 0 ? (
          <p className="sunny-schedule-empty-day">加载中…</p>
        ) : checklists.length === 0 ? (
          error ? null : (
            <p className="sunny-schedule-empty-day">
              暂无清单。
              <br />
              可以告诉 Sunny 创建一个新清单。
            </p>
          )
        ) : (
          checklists.map((cl, index) => {
            const card = (
            <div
              aria-current={navigationChecklist?.id === cl.id ? "true" : undefined}
              className={`sunny-checklist-card${expandedId === cl.id ? " is-expanded" : ""}`}
              ref={navigationChecklist?.id === cl.id ? navigationFocusRef : undefined}
            >
              <button
                aria-expanded={expandedId === cl.id}
                type="button"
                className="sunny-checklist-card-header"
                onClick={() =>
                  setExpandedId((prev) =>
                    prev === cl.id ? null : cl.id,
                  )
                }
              >
                <span className="sunny-checklist-card-title">{cl.title}</span>
                <span
                  className={`sunny-checklist-status-badge is-${cl.status}`}
                >
                  {cl.status === "active"
                    ? "进行中"
                    : cl.status === "done"
                      ? "已完成"
                      : "已归档"}
                </span>
              </button>
              {/* Progress bar */}
              <div className="sunny-checklist-progress-bar">
                <div
                  className="sunny-checklist-progress-fill"
                  style={{
                    width:
                      cl.totalItems > 0
                        ? `${Math.round((cl.completedItems / cl.totalItems) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
              <span className="sunny-checklist-progress-label">
                {cl.completedItems}/{cl.totalItems} 项完成
              </span>
              {expandedId === cl.id ? (
                <div className="sunny-checklist-relationship-section">
                  <span>关联对象</span>
                  <LinkedObjectList
                    defaultExpanded
                    items={cl.linkedObjects}
                  />
                </div>
              ) : null}
              {/* Expanded items */}
              {expandedId === cl.id && cl.items.length > 0 ? (
                <ul className="sunny-checklist-items-list">
                  {cl.items.slice(0, 20).map((item) => (
                    <li
                      key={item.key}
                      className={item.completed ? "is-done" : ""}
                    >
                      <span className={`sunny-checklist-item-icon${item.completed ? " is-done" : ""}`}>
                        {item.completed ? (
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="m5 11 3.5 3.5 6.5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        )}
                      </span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            );

            return index < 6 ? (
              <DashboardStaggerItem key={cl.id}>{card}</DashboardStaggerItem>
            ) : (
              <div key={cl.id}>{card}</div>
            );
          })
        )}
      </DashboardStagger>
    </div>
  );
}
