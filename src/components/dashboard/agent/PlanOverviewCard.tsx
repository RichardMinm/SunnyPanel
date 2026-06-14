import Link from "next/link";
import type { PlanOverviewData } from "./utils";

type PlanOverviewCardProps = {
  data: PlanOverviewData;
};

export function PlanOverviewCard({ data }: PlanOverviewCardProps) {
  return (
    <section className="sunny-agent-result-card sunny-agent-result-card-plan" aria-label="计划概览">
      <p className="sunny-agent-result-card-kicker">计划概览</p>
      <h3>{data.title}</h3>
      <div className="sunny-agent-result-card-grid" aria-label="计划详情">
        {data.phaseCount != null ? (
          <div>
            <span>阶段数</span>
            <strong>{data.phaseCount} 个阶段</strong>
          </div>
        ) : null}
        {data.estimatedDays != null ? (
          <div>
            <span>预计天数</span>
            <strong>{data.estimatedDays} 天</strong>
          </div>
        ) : null}
      </div>
      <div className="sunny-agent-result-card-actions">
        <Link className="sunny-agent-result-card-link" href="/dashboard">
          查看计划
        </Link>
      </div>
    </section>
  );
}
