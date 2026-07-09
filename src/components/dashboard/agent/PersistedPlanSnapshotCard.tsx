"use client";

import { useState } from "react";
import type { PlanSummary } from "@/app/api/agent/plans/route";

type PersistedPlanSnapshotCardProps = {
  plan: PlanSummary;
};

const stateLabelMap: Record<string, string> = {
  active: "进行中",
  backlog: "待开始",
  done: "已完成",
  paused: "已暂停",
};

const statusLabelMap: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

export function PersistedPlanSnapshotCard({ plan }: PersistedPlanSnapshotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const stateLabel = (plan.state && stateLabelMap[plan.state]) ?? plan.state ?? "—";
  const statusLabel = (plan.status && statusLabelMap[plan.status]) ?? plan.status ?? "—";
  const updatedLabel = plan.updatedAt
    ? new Date(plan.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    : null;

  return (
    <article className="sunny-persisted-plan-card" aria-label={`计划：${plan.title}`}>
      <button
        type="button"
        className="sunny-persisted-plan-card-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="sunny-persisted-plan-card-title-row">
          <h3>{plan.title}</h3>
          <span className={`sunny-persisted-plan-card-arrow${expanded ? " is-expanded" : ""}`}>
            ▾
          </span>
        </div>
        <div className="sunny-persisted-plan-card-meta">
          <span>{stateLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{statusLabel}</span>
          {updatedLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{updatedLabel}</span>
            </>
          ) : null}
        </div>
      </button>

      {/* Progress bar */}
      {plan.progress != null ? (
        <div className="sunny-persisted-plan-card-progress" role="meter" aria-valuenow={plan.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="sunny-persisted-plan-card-progress-bar">
            <div
              className="sunny-persisted-plan-card-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, plan.progress))}%` }}
            />
          </div>
          <span className="sunny-persisted-plan-card-progress-label">进度 {plan.progress}%</span>
        </div>
      ) : null}

      {/* Counts */}
      <div className="sunny-persisted-plan-card-counts">
        {plan.checklists.length > 0 ? (
          <span>关联清单 {plan.checklists.length}</span>
        ) : null}
        {plan.scheduleItems.length > 0 ? (
          <span>关联日程 {plan.scheduleItems.length}</span>
        ) : null}
        {plan.checklists.length === 0 && plan.scheduleItems.length === 0 ? (
          <span className="sunny-persisted-plan-card-counts-empty">暂无关联内容</span>
        ) : null}
      </div>

      {/* Expanded details */}
      {expanded ? (
        <div className="sunny-persisted-plan-card-details">
          {plan.checklists.length > 0 ? (
            <div className="sunny-persisted-plan-card-detail-section">
              <h4>关联清单</h4>
              <ul>
                {plan.checklists.map((cl) => (
                  <li key={cl.id}>
                    <span>{cl.title}</span>
                    <span className="sunny-persisted-plan-card-detail-stat">
                      {cl.completedItems}/{cl.totalItems}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.scheduleItems.length > 0 ? (
            <div className="sunny-persisted-plan-card-detail-section">
              <h4>关联日程</h4>
              <ul>
                {plan.scheduleItems.map((si) => (
                  <li key={si.id}>
                    <span>{si.title}</span>
                    <span className="sunny-persisted-plan-card-detail-stat">
                      {si.startsAt ? si.startsAt.slice(0, 10) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
