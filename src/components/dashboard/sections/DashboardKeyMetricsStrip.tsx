import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { DashboardMetricCard } from "@/components/ui/SunnyComponents";

type DashboardKeyMetricsStripProps = {
  model: DashboardPageViewModel;
};

export function DashboardKeyMetricsStrip({ model }: DashboardKeyMetricsStripProps) {
  const { draftContentWithoutPlans, metricToneFor, snapshot } = model;

  return (
    <section aria-label="关键状态" className="sunny-dashboard-metric-strip">
      <DashboardMetricCard
        description={`${snapshot.counts.activePlansWithoutOutputs} 项活跃计划还没有产出内容。`}
        label="活跃计划"
        tone={metricToneFor("planOutputs", snapshot.counts.activePlansWithoutOutputs > 0)}
        value={snapshot.counts.activePlans}
      />
      <DashboardMetricCard
        description="最近开始写、适合优先清掉的内容总数。"
        label="草稿积压"
        tone={metricToneFor("drafts", draftContentWithoutPlans.length > 0)}
        value={snapshot.counts.draftSurfaces}
      />
      <DashboardMetricCard
        description="当前已在前台可见的内容总数。"
        label="公开内容"
        value={snapshot.counts.publicSurfaces}
      />
      <DashboardMetricCard
        description={`${snapshot.counts.recentTimelineCandidates} 条变化还没进入 Timeline。`}
        label="叙事缺口"
        tone={metricToneFor("timeline", snapshot.counts.recentTimelineCandidates > 0)}
        value={snapshot.execution.timelineCandidates.length}
      />
    </section>
  );
}
