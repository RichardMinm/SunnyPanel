"use client";

import { useEffect, useState } from "react";
import { PersistedPlanSnapshotCard } from "./PersistedPlanSnapshotCard";
import type { PlanSummary } from "@/lib/core-linkage/contracts";
import {
  findExactNavigationTarget,
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

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- data fetching pattern consistent with dashboard views */
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/agent/plans")
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json() as Promise<{ plans: PlanSummary[] }>;
      })
      .then((data) => {
        if (!cancelled) setPlans(data.plans ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载计划失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="sunny-agent-inspector-panel">
        <p className="sunny-agent-inspector-empty">加载中…</p>
      </div>
    );
  }

  if (error) {
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
