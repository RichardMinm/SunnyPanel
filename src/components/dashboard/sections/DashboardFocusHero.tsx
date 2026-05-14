import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { FocusActionCard } from "@/components/dashboard/DashboardPrimitives";
import { SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";

type DashboardFocusHeroProps = {
  model: DashboardPageViewModel;
};

export function DashboardFocusHero({ model }: DashboardFocusHeroProps) {
  const {
    continueWritingHref,
    continueWritingLabel,
    displayName,
    fullAgentHref,
    primaryFocusItem,
  } = model;

  return (
    <section className="sunny-dashboard-card sunny-card-strong sunny-dashboard-hero">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.82fr)] xl:items-stretch">
        <div className="flex min-w-0 flex-col justify-between gap-5">
          <div>
            <p className="sunny-kicker text-xs text-muted">今日工作台</p>
            <h1 className="sunny-display mt-2 text-3xl leading-tight text-foreground md:text-4xl">
              你好，{displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              今天先让一个关键动作往前走。计划、草稿和时间线缺口会排好优先级，细节留在下方慢慢查。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="sunny-button-primary" href={continueWritingHref}>
              {continueWritingLabel}
            </Link>
            <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/updates/create">
              记录动态
            </Link>
            <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/timeline-events/create">
              补时间线
            </Link>
            <Link className="sunny-button-secondary px-4 py-2 text-sm" href={fullAgentHref}>
              全屏问 Agent
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <Link className="sunny-dashboard-utility-link" href="/admin">
              打开 Admin
            </Link>
            <Link className="sunny-dashboard-utility-link" href="/">
              查看公开站点
            </Link>
          </div>
        </div>

        <div className="sunny-dashboard-hero-focus">
          <SectionHeader
            kicker="今日焦点"
            title="最值得先做的一件事"
            action={<StatusBadge tone={primaryFocusItem.tone}>{primaryFocusItem.actionLabel}</StatusBadge>}
          />
          <div className="mt-4">
            <FocusActionCard strong {...primaryFocusItem} />
          </div>
        </div>
      </div>
    </section>
  );
}
