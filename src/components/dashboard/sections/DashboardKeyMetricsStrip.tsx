import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { DashboardMetricCard } from "@/components/ui/SunnyComponents";

type DashboardKeyMetricsStripProps = {
  as?: "div" | "section";
  compact?: boolean;
  model: DashboardPageViewModel;
};

export function DashboardKeyMetricsStrip({ as = "section", compact, model }: DashboardKeyMetricsStripProps) {
  const { draftContentWithoutPlans, metricToneFor, snapshot } = model;

  const stripClass = ["sunny-dashboard-metric-strip", compact && "sunny-dashboard-metric-strip--compact"]
    .filter(Boolean)
    .join(" ");

  const cards = (
    <>
      <DashboardMetricCard
        compact={compact}
        description={`${snapshot.counts.activePlansWithoutOutputs} 项活跃计划还没有产出内容。`}
        label="活跃计划"
        tone={metricToneFor("planOutputs", snapshot.counts.activePlansWithoutOutputs > 0)}
        value={snapshot.counts.activePlans}
      />
      <DashboardMetricCard
        compact={compact}
        description="最近开始写、适合优先清掉的内容总数。"
        label="草稿积压"
        tone={metricToneFor("drafts", draftContentWithoutPlans.length > 0)}
        value={snapshot.counts.draftSurfaces}
      />
      <DashboardMetricCard
        compact={compact}
        description="当前已在前台可见的内容总数。"
        label="公开内容"
        value={snapshot.counts.publicSurfaces}
      />
      <DashboardMetricCard
        compact={compact}
        description={`${snapshot.counts.recentTimelineCandidates} 条变化还没进入 Timeline。`}
        label="叙事缺口"
        tone={metricToneFor("timeline", snapshot.counts.recentTimelineCandidates > 0)}
        value={snapshot.execution.timelineCandidates.length}
      />
    </>
  );

  if (as === "div") {
    return (
      <div aria-label="关键状态" className={stripClass} role="group">
        {cards}
      </div>
    );
  }

  return <section aria-label="关键状态" className={stripClass}>{cards}</section>;
}
