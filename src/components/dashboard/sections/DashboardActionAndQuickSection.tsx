import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { quickCreateActions, quickManageActions } from "@/components/dashboard/dashboard-page-constants";
import { FocusActionCard } from "@/components/dashboard/DashboardPrimitives";
import { EmptyState, QuickActionCard, SectionHeader } from "@/components/ui/SunnyComponents";

type DashboardActionAndQuickSectionProps = {
  model: DashboardPageViewModel;
};

export function DashboardActionAndQuickSection({ model }: DashboardActionAndQuickSectionProps) {
  const { secondaryActionItems } = model;

  return (
    <section className="grid gap-5 md:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)] md:items-start">
      <div className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-dashboard-action-queue self-start">
        <SectionHeader
          kicker="行动队列"
          title="接下来这些"
          description="主行动已经放在上方，这里只保留第二优先级之后的动作。"
          action={<span className="sunny-dashboard-count">{secondaryActionItems.length} 项</span>}
        />

        <div className="mt-4 grid gap-3">
          {secondaryActionItems.length > 0 ? (
            secondaryActionItems.map((item, index) => (
              <FocusActionCard compact key={`${item.title}-${item.href}`} index={index} {...item} />
            ))
          ) : (
            <EmptyState>暂时没有第二优先级动作。先把上方那一件事推进就好。</EmptyState>
          )}
        </div>
      </div>

      <div className="sunny-dashboard-card sunny-dashboard-quick-card self-start">
        <SectionHeader
          kicker="快速创建"
          title="点进去就开始写"
          description="常用入口压成紧凑动作，减少在 Admin 里找入口的时间。"
          action={<span className="sunny-dashboard-count">快速</span>}
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {quickCreateActions.map((item) => (
            <QuickActionCard compact key={item.href} description={item.description} href={item.href} title={item.label} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {quickManageActions.map((item) => (
            <Link key={item.href} href={item.href} className="sunny-dashboard-utility-link">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
