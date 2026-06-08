"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewSummary = {
  id: number;
  planTitle: string;
  week: string;
  completedCount: number;
  totalCount: number;
  risks: string[];
  updatedAt: string;
};

type ReviewPanelProps = {
  planId?: number | null;
  onOpenPlan?: (planId: number) => void;
  onGenerateReview?: () => void;
};

export function AgentReviewPanel({
  planId,
  onOpenPlan,
  onGenerateReview,
}: ReviewPanelProps) {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = planId ? `?planId=${planId}` : "";
      const res = await fetch(`/api/agent/evaluate${params}`);
      if (res.ok) {
        const data = (await res.json()) as { reviews?: ReviewSummary[] };
        setReviews(data.reviews ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  if (loading) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
        <p className="sunny-agent-inspector-empty">加载复盘记录...</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂无复盘记录</h3>
          <p>
            在对话中使用「回顾」模式，或点击下方按钮生成复盘。
          </p>
        </div>
        {onGenerateReview ? (
          <button
            type="button"
            className="sunny-agent-confirm-button"
            onClick={onGenerateReview}
            style={{ marginTop: "12px" }}
          >
            + 对当前计划生成新复盘
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-review-panel">
      <div className="sunny-agent-inspector-summary">
        <span>复盘历史</span>
        <h3>{reviews.length} 条复盘记录</h3>
      </div>
      <ul className="sunny-agent-review-history-list">
        {reviews.map((review) => (
          <li key={review.id}>
            <button
              type="button"
              className={`sunny-agent-review-history-item${expandedId === review.id ? " is-expanded" : ""}`}
              onClick={() =>
                setExpandedId((prev) =>
                  prev === review.id ? null : review.id,
                )
              }
            >
              <div className="sunny-agent-review-history-meta">
                <strong>{review.planTitle}</strong>
                <small>{review.week}</small>
              </div>
              <div className="sunny-agent-review-history-progress">
                <span>
                  完成 {review.completedCount}/{review.totalCount} 项
                </span>
                {review.risks.length > 0 ? (
                  <span className="sunny-agent-review-history-risk">
                    {review.risks.length} 个风险
                  </span>
                ) : null}
              </div>
            </button>
            {expandedId === review.id ? (
              <div className="sunny-agent-review-history-detail">
                {onOpenPlan ? (
                  <button
                    type="button"
                    onClick={() => onOpenPlan(review.id)}
                  >
                    查看计划
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {onGenerateReview ? (
        <button
          type="button"
          className="sunny-agent-confirm-button"
          onClick={onGenerateReview}
          style={{ marginTop: "12px" }}
        >
          + 生成新复盘
        </button>
      ) : null}
    </div>
  );
}
