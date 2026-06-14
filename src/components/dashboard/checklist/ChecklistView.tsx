"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardStagger, DashboardStaggerItem } from "../motion/DashboardStagger";

type ChecklistItem = { key: string; label: string; completed: boolean };

type ChecklistSummary = {
  id: number;
  title: string;
  status: string;
  relatedPlan?: { id: number; title: string } | null;
  items: ChecklistItem[];
  totalItems: number;
  completedItems: number;
};

type ChecklistViewProps = {
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
  onBackToWorkbench: _onBackToWorkbench,
}: ChecklistViewProps) {
  void _onBackToWorkbench; // kept for prop compatibility
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchChecklists = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      params.set("limit", "20");
      const res = await fetch(
        `/api/agent/checklist?${params.toString()}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          checklists: ChecklistSummary[];
        };
        setChecklists(data.checklists ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- data fetching pattern consistent with existing dashboard views */
    void fetchChecklists();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchChecklists]);

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
        {loading ? (
          <p className="sunny-schedule-empty-day">加载中…</p>
        ) : checklists.length === 0 ? (
          <p className="sunny-schedule-empty-day">
            暂无清单。
            <br />
            可以从 Payload 管理后台创建新清单。
          </p>
        ) : (
          checklists.map((cl, index) => {
            const card = (
            <div
              className={`sunny-checklist-card${expandedId === cl.id ? " is-expanded" : ""}`}
            >
              <button
                type="button"
                className="sunny-checklist-card-header"
                onClick={() =>
                  setExpandedId((prev) =>
                    prev === cl.id ? null : cl.id,
                  )
                }
              >
                <div>
                  <h3>{cl.title}</h3>
                  {cl.relatedPlan ? (
                    <small>关联 {cl.relatedPlan.title} 计划</small>
                  ) : null}
                </div>
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
              {/* Expanded items */}
              {expandedId === cl.id && cl.items.length > 0 ? (
                <ul className="sunny-checklist-items-list">
                  {cl.items.slice(0, 20).map((item) => (
                    <li
                      key={item.key}
                      className={item.completed ? "is-done" : ""}
                    >
                      <span>{item.completed ? "✓" : "○"}</span>
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
