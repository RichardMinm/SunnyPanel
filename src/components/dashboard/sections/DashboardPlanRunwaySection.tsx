import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import {
  planColumns,
  planPriorityLabelMap,
  planPriorityToneMap,
  planStateToneMap,
  planStatusLabelMap,
  planStatusToneMap,
} from "@/components/dashboard/dashboard-page-constants";
import { getLinkedContent } from "@/components/dashboard/dashboard-page-helpers";
import { EmptyState, SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";
import { formatDate } from "@/lib/formatters";

type DashboardPlanRunwaySectionProps = {
  model: DashboardPageViewModel;
};

export function DashboardPlanRunwaySection({ model }: DashboardPlanRunwaySectionProps) {
  const { locale, snapshot } = model;

  return (
    <section className="sunny-dashboard-card sunny-plan-runway">
      <SectionHeader
        kicker="计划跑道"
        title="计划执行跑道"
        description="把正在推进、等待启动和暂停中的计划放在同一条跑道上，方便判断下一步动作。"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link className="sunny-dashboard-link" href="/admin/collections/plans">
              打开全部计划
            </Link>
            <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans/create">
              新建计划
            </Link>
          </div>
        }
      />

      <div className="sunny-plan-runway-grid mt-5">
        {planColumns.map((column) => {
          const plans = snapshot.plans[column.key];

          return (
            <div key={column.key} className="sunny-plan-runway-lane">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{column.label}</h3>
                <StatusBadge tone={planStateToneMap[column.key]}>{plans.length}</StatusBadge>
              </div>

              <div className="sunny-plan-runway-list mt-3">
                {plans.length > 0 ? (
                  plans.map((plan) => {
                    const linkedContent = getLinkedContent(plan).slice(0, 2);
                    const planHref = `/admin/collections/plans/${plan.id}`;

                    return (
                      <div key={plan.id} className="sunny-plan-runway-row">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                            <Link href={planHref} className="sunny-plan-runway-title">
                              {plan.title}
                            </Link>
                            <div className="flex flex-wrap gap-1.5">
                              <StatusBadge tone={planPriorityToneMap[plan.priority]}>{planPriorityLabelMap[plan.priority]}</StatusBadge>
                              <StatusBadge tone={planStatusToneMap[plan.status]}>{planStatusLabelMap[plan.status]}</StatusBadge>
                            </div>
                          </div>

                          <div className="mt-2 grid gap-1.5 text-xs leading-5 text-muted">
                            <p className="sunny-dashboard-clamp">{plan.description || "还没有补充描述。"}</p>
                            <p>{plan.dueDate ? `截止 ${formatDate(plan.dueDate, locale)}` : "未设截止日期"}</p>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {linkedContent.length > 0 ? (
                              linkedContent.map((item) => (
                                <span
                                  key={`${plan.id}-${item.label}-${item.title}`}
                                  className="sunny-dashboard-count max-w-full truncate"
                                >
                                  {item.label}: {item.title}
                                </span>
                              ))
                            ) : (
                              <span className="sunny-dashboard-count">尚未关联内容</span>
                            )}
                          </div>
                        </div>

                        <Link href={planHref} className="sunny-runway-action">
                          {column.actionLabel}
                        </Link>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState>{column.empty}</EmptyState>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
