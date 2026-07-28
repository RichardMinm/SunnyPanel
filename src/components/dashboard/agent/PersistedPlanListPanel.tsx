"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PersistedPlanSnapshotCard } from "./PersistedPlanSnapshotCard";
import type { PlanSummary } from "@/lib/core-linkage/contracts";
import {
  createRetainedDomainRequestRunner,
  findExactNavigationTarget,
  useDomainRefresh,
  type DomainLoadMode,
  type LinkedObjectNavigationTarget,
} from "@/components/dashboard/linked-objects";

type PersistedPlanListPanelProps = {
  navigationGeneration?: number;
  navigationTarget?: Extract<
    LinkedObjectNavigationTarget,
    { type: "plan" }
  > | null;
};

export function PersistedPlanListPanel({
  navigationGeneration,
  navigationTarget = null,
}: PersistedPlanListPanelProps) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRunnerRef = useRef(createRetainedDomainRequestRunner());

  const loadPlans = useCallback((mode: DomainLoadMode) =>
    requestRunnerRef.current.run({
      clearError: () => setError(null),
      load: async () => {
        const res = await fetch("/api/agent/plans");
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as { plans: PlanSummary[] };
        return data.plans ?? [];
      },
      mode,
      onData: setPlans,
      onError: () => setError("刷新失败，请重试"),
      setForegroundLoading: setLoading,
    }), []);

  useDomainRefresh("plans", loadPlans);

  useEffect(() => {
    return loadPlans("foreground");
  }, [loadPlans]);

  if (loading && plans.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel">
        <p className="sunny-agent-inspector-empty">加载中…</p>
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel">
        <p className="sunny-agent-inspector-empty">错误：{error}</p>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂无计划</h3>
          <p>通过 Agent 创建计划后，这里会显示计划进度和关联内容。</p>
        </div>
      </div>
    );
  }

  const navigationPlan = findExactNavigationTarget(
    plans,
    navigationTarget?.id,
  );

  return (
    <div className="sunny-agent-inspector-panel sunny-persisted-plan-list">
      {error ? (
        <p className="sunny-agent-inspector-empty" role="alert">
          {error}
        </p>
      ) : null}
      {plans.map((plan) => {
        const isNavigationTarget = navigationPlan?.id === plan.id;
        return (
          <PersistedPlanSnapshotCard
            isNavigationTarget={isNavigationTarget}
            key={plan.id}
            navigationGeneration={navigationGeneration}
            plan={plan}
          />
        );
      })}
    </div>
  );
}
