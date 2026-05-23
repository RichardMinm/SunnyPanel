import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { FocusActionCard } from "@/components/dashboard/DashboardPrimitives";
import { DashboardKeyMetricsStrip } from "@/components/dashboard/sections/DashboardKeyMetricsStrip";
import { SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";

type DashboardFocusHeroProps = {
  model: DashboardPageViewModel;
};

export function DashboardFocusHero({ model }: DashboardFocusHeroProps) {
  const {
    continueWritingHref,
    continueWritingLabel,
    displayName,
    primaryFocusItem,
  } = model;

  return (
    <section className="sunny-dashboard-card sunny-card-strong sunny-dashboard-hero">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.78fr)] xl:items-stretch">
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div>
            <p className="sunny-kicker text-xs text-muted">工作台</p>
            <h1 className="sunny-display mt-1.5 text-2xl leading-tight text-foreground md:text-3xl">
              你好，{displayName}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              先推进一件事；计划、草稿与日程在下方。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="sunny-button-primary" href={continueWritingHref}>
              {continueWritingLabel}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <Link className="sunny-dashboard-utility-link" href="/admin">
              Admin
            </Link>
            <Link className="sunny-dashboard-utility-link" href="/">
              公开站点
            </Link>
            <Link className="sunny-dashboard-utility-link" href="/admin/collections/updates/create">
              记录动态
            </Link>
            <Link className="sunny-dashboard-utility-link" href="/admin/collections/timeline-events/create">
              补时间线
            </Link>
          </div>
        </div>

        <div className="sunny-dashboard-hero-focus">
          <SectionHeader
            kicker="焦点"
            title="优先这一件"
            action={<StatusBadge tone={primaryFocusItem.tone}>{primaryFocusItem.actionLabel}</StatusBadge>}
          />
          <div className="mt-3">
            <FocusActionCard strong {...primaryFocusItem} />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border/50 pt-4">
        <DashboardKeyMetricsStrip as="div" compact model={model} />
      </div>
    </section>
  );
}
