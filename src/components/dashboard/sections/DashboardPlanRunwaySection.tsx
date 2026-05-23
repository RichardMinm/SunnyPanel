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
  embedded?: boolean;
  model: DashboardPageViewModel;
};

export function DashboardPlanRunwaySection({ embedded, model }: DashboardPlanRunwaySectionProps) {
  const { locale, snapshot } = model;

  const content = (
    <>
      {!embedded ? (
        <SectionHeader
          kicker="计划"
          title="跑道"
          description="进行中、待启动与暂停。"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link className="sunny-dashboard-link" href="/admin/collections/plans">
                全部
              </Link>
              <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans/create">
                新建
              </Link>
            </div>
          }
        />
      ) : null}

      <div className={`sunny-plan-runway-grid${embedded ? " sunny-plan-runway-grid--stacked" : ""}${embedded ? " mt-0" : " mt-5"}`}>
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

                          {(() => {
                            const phases = plan.phases as
                              | Array<{ title: string; estimatedDays: number; milestones?: Array<{ title: string }> }>
                              | null
                              | undefined;
                            if (!phases || !Array.isArray(phases) || phases.length === 0) return null;
                            const progress = typeof plan.progress === "number" ? plan.progress : 0;
                            return (
                              <div className="mt-2">
                                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                                  <span>{phases.length} 个阶段{plan.totalEstimatedDays ? ` · ${plan.totalEstimatedDays} 天` : ""}</span>
                                  <span>{progress}%</span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                                  <div
                                    className="h-full rounded-full bg-accent transition-all"
                                    style={{ width: `${Math.max(2, progress)}%` }}
                                  />
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                                  {phases.slice(0, 4).map((phase, i) => (
                                    <span key={i} className="sunny-dashboard-count">{phase.title}</span>
                                  ))}
                                  {phases.length > 4 ? (
                                    <span className="sunny-dashboard-count">+{phases.length - 4}</span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })()}

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
    </>
  );

  if (embedded) {
    return content;
  }

  return <section className="sunny-dashboard-card sunny-plan-runway">{content}</section>;
}
