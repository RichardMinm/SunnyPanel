"use client";

import { useEffect, useState } from "react";
import type { PlanSummary } from "@/lib/core-linkage/contracts";
import { useLinkedObjectFocus } from "@/components/dashboard/linked-objects";

type PersistedPlanSnapshotCardProps = {
  isNavigationTarget?: boolean;
  navigationGeneration?: number;
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

export function PersistedPlanSnapshotCard({
  isNavigationTarget = false,
  navigationGeneration,
  plan,
}: PersistedPlanSnapshotCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const focusRef = useLinkedObjectFocus<HTMLElement>(
    isNavigationTarget,
    isNavigationTarget
      ? `${plan.id}:${navigationGeneration ?? 0}`
      : null,
  );

  useEffect(() => {
    if (isNavigationTarget) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- exact plan navigation expands the intended card after API data resolves */
      setIsExpanded(true);
    }
  }, [isNavigationTarget, navigationGeneration, plan.id]);
  const stateLabel = (plan.state && stateLabelMap[plan.state]) ?? plan.state ?? "—";
  const statusLabel = (plan.status && statusLabelMap[plan.status]) ?? plan.status ?? "—";
  const updatedLabel = plan.updatedAt
    ? new Date(plan.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    : null;

  return (
    <article
      aria-current={isNavigationTarget ? "true" : undefined}
      aria-label={`计划：${plan.title}`}
      className="sunny-persisted-plan-card"
      ref={focusRef}
    >
      <button
        aria-expanded={isExpanded}
        type="button"
        className="sunny-persisted-plan-card-header"
        onClick={() => setIsExpanded((value) => !value)}
      >
        <div className="sunny-persisted-plan-card-title-row">
          <h3>{plan.title}</h3>
          <span className={`sunny-persisted-plan-card-arrow${isExpanded ? " is-expanded" : ""}`}>
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
      {isExpanded ? (
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
