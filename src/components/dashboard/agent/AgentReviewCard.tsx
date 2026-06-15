"use client";

import { DashboardIcon } from "../icons";

export type ReviewCardData = {
  planTitle: string;
  week: string;
  completedItems: string[];
  incompleteItems: string[];
  risks: string[];
  suggestions: string[];
  progressSummary: string;
  planId: number;
};

export type AgentReviewCardProps = {
  data: ReviewCardData;
  onOpenInInspector?: () => void;
  onViewPlan?: (planId: number) => void;
};

export function AgentReviewCard({
  data,
  onOpenInInspector,
  onViewPlan,
}: AgentReviewCardProps) {
  const {
    planTitle,
    week,
    completedItems,
    incompleteItems,
    risks,
    suggestions,
    progressSummary,
    planId,
  } = data;

  return (
    <section
      className="sunny-agent-review-card"
      aria-label={`复盘：${planTitle}`}
      role="region"
    >
      {/* Header */}
      <div className="sunny-agent-review-card-head">
        <div>
          <span>复盘完成</span>
          <h3>
            {planTitle} · 周复盘
          </h3>
        </div>
        <span className="sunny-agent-review-card-week">{week}</span>
      </div>

      {/* Summary */}
      <p className="sunny-agent-review-card-summary">{progressSummary}</p>

      {/* Grid */}
      <div className="sunny-agent-review-card-grid">
        <div>
          <span>完成项</span>
          <ul>
            {completedItems.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>未完成</span>
          <ul>
            {incompleteItems.length > 0 ? (
              incompleteItems.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))
            ) : (
              <li className="sunny-agent-review-card-empty">全部完成</li>
            )}
          </ul>
        </div>
        <div>
          <span>风险/阻塞</span>
          <ul>
            {risks.length > 0 ? (
              risks.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))
            ) : (
              <li className="sunny-agent-review-card-empty">无风险</li>
            )}
          </ul>
        </div>
        <div>
          <span>建议调整</span>
          <ul>
            {suggestions.length > 0 ? (
              suggestions.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))
            ) : (
              <li className="sunny-agent-review-card-empty">无建议</li>
            )}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="sunny-agent-review-card-actions" role="toolbar">
        {onViewPlan ? (
          <button type="button" onClick={() => onViewPlan(planId)}>
            查看计划
          </button>
        ) : null}
        {onOpenInInspector ? (
          <button type="button" onClick={onOpenInInspector}>
            在 Inspector 中打开 <DashboardIcon name="chevronRight" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
