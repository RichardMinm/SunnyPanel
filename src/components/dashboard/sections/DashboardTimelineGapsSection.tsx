import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { relationLabelMap, relationToneMap } from "@/components/dashboard/dashboard-page-constants";
import { EmptyState, SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";
import { formatDateTime } from "@/lib/formatters";

type DashboardTimelineGapsSectionProps = {
  model: DashboardPageViewModel;
};

export function DashboardTimelineGapsSection({ model }: DashboardTimelineGapsSectionProps) {
  const { locale, snapshot } = model;

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-timeline-gap-panel sunny-narrative-gap-panel">
      <SectionHeader
        kicker="叙事缺口"
        title="还没进入 Timeline 的变化"
        description="这些内容已经发生变化，但还没有被写进时间线；补节点会让 SunnyPanel 的叙事记忆更完整。"
        action={<span className="sunny-dashboard-count">{snapshot.execution.timelineCandidates.length} 条</span>}
      />

      <div className="sunny-dashboard-list sunny-narrative-gap-list mt-4">
        {snapshot.execution.timelineCandidates.length > 0 ? (
          snapshot.execution.timelineCandidates.slice(0, 5).map((item) => (
            <div key={`${item.kind}-${item.id}`} className="sunny-dashboard-row sunny-timeline-gap-row">
              <div className="sunny-timeline-gap-marker" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h3>
                  <StatusBadge tone={relationToneMap[item.kind] ?? "neutral"}>{relationLabelMap[item.kind]}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted">更新：{formatDateTime(item.updatedAt, locale)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="sunny-gap-action-secondary" href={item.href}>
                    打开内容
                  </Link>
                  <Link className="sunny-gap-action-primary" href="/admin/collections/timeline-events/create">
                    新建节点
                  </Link>
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState>最近的重要变化都已经整理进 Timeline。</EmptyState>
        )}
      </div>
    </section>
  );
}
