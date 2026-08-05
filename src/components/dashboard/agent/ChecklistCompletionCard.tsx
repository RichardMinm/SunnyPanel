import { AgentResultDelivery } from "./AgentResultDelivery";
import type { ChecklistCompletionData } from "./utils";

type ChecklistCompletionCardProps = {
  data: ChecklistCompletionData;
};

export function ChecklistCompletionCard({ data }: ChecklistCompletionCardProps) {
  const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <section className="sunny-agent-result-card sunny-agent-result-card-checklist" aria-label="清单完成情况">
      <p className="sunny-agent-result-card-kicker">清单进度</p>
      <h3>{data.title}</h3>
      <div className="sunny-agent-result-card-grid" aria-label="清单详情">
        <div>
          <span>已完成</span>
          <strong>{data.completed} / {data.total} 项</strong>
        </div>
        <div>
          <span>完成率</span>
          <strong>{pct}%</strong>
        </div>
      </div>
      <div className="sunny-agent-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="sunny-agent-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <AgentResultDelivery statusLabel="进度信息已整理" workspace="checklist" />
    </section>
  );
}
