import { AgentResultDelivery } from "./AgentResultDelivery";
import type { ScheduleResultSummary } from "./utils";

type ScheduleResultCardProps = {
  result: ScheduleResultSummary;
};

export function ScheduleResultCard({ result }: ScheduleResultCardProps) {
  return (
    <section className="sunny-agent-result-card sunny-agent-result-card-schedule" aria-label="日程创建结果">
      <p className="sunny-agent-result-card-kicker">已创建日程</p>
      <h3>{result.title}</h3>
      <div className="sunny-agent-result-card-grid" aria-label="日程详情">
        <div>
          <span>日期</span>
          <strong>{result.date}</strong>
        </div>
        <div>
          <span>时间</span>
          <strong>{result.timeRange}</strong>
        </div>
      </div>
      <AgentResultDelivery
        statusLabel="日程已保存"
        workspace="schedule"
      />
    </section>
  );
}
