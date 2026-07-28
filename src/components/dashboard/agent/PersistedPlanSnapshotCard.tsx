"use client";

import { useEffect, useState } from "react";
import type { PlanSummary } from "@/lib/core-linkage/contracts";
import {
  LinkedObjectList,
  useLinkedObjectFocus,
} from "@/components/dashboard/linked-objects";

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
  const [isExpanded, setIsExpanded] = useState(isNavigationTarget);
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
  const checklistCount = plan.linkedObjects.filter(
    (linkedObject) => linkedObject.type === "checklist",
  ).length;
  const scheduleCount = plan.linkedObjects.filter(
    (linkedObject) => linkedObject.type === "schedule",
  ).length;
  const timelineCount = plan.linkedObjects.filter(
    (linkedObject) => linkedObject.type === "timeline",
  ).length;

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
        <span>关联清单 {checklistCount}</span>
        <span>关联日程 {scheduleCount}</span>
        <span>关联时间线 {timelineCount}</span>
      </div>

      {/* Expanded details */}
      {isExpanded ? (
        <div className="sunny-persisted-plan-card-details">
          <div className="sunny-persisted-plan-card-detail-section">
            <h4>关联对象</h4>
            <LinkedObjectList
              defaultExpanded
              items={plan.linkedObjects}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
