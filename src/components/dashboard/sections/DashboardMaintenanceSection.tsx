import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { planPriorityLabelMap, planPriorityToneMap, planStateToneMap } from "@/components/dashboard/dashboard-page-constants";
import { EmptyState, SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";
import { formatDate, formatDateTime } from "@/lib/formatters";

type DashboardMaintenanceSectionProps = {
  model: DashboardPageViewModel;
};

export function DashboardMaintenanceSection({ model }: DashboardMaintenanceSectionProps) {
  const { dueSoonPlans, locale, overduePlans, pendingOnboardingTasks, snapshot } = model;

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-maintenance-section">
      <SectionHeader
        kicker="复盘与维护"
        title="复盘与维护"
        description="这些模块保留在工作台下方，用来检查节奏、沉淀完成项和维护基础设置。"
      />

      <div className="sunny-maintenance-grid mt-5">
        <div className="sunny-maintenance-panel">
          <div className="sunny-maintenance-head">
            <div>
              <p className="sunny-kicker text-[0.62rem] text-muted">截止提醒</p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">快到期和已逾期</h3>
            </div>
            <span className="sunny-dashboard-count">{overduePlans.length + dueSoonPlans.length} 项</span>
          </div>

          <div className="sunny-dashboard-list mt-3 text-sm text-muted">
            {overduePlans.map(({ dayOffset, plan }) => (
              <div key={`overdue-${plan.id}`} className="sunny-dashboard-row sunny-maintenance-row">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{plan.title}</h4>
                  <StatusBadge tone="danger">已逾期 {Math.abs(dayOffset)} 天</StatusBadge>
                </div>
                <p className="mt-1 text-xs">原定截止：{formatDate(plan.dueDate, locale)}。</p>
              </div>
            ))}

            {dueSoonPlans.map(({ dayOffset, plan }) => (
              <div key={`soon-${plan.id}`} className="sunny-dashboard-row sunny-maintenance-row">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{plan.title}</h4>
                  <StatusBadge tone={planStateToneMap[plan.state]}>
                    {dayOffset === 0 ? "今天到期" : `${dayOffset} 天内到期`}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs">截止日期：{formatDate(plan.dueDate, locale)}。</p>
              </div>
            ))}

            {overduePlans.length === 0 && dueSoonPlans.length === 0 ? (
              <EmptyState>最近 7 天内没有临近截止的计划，节奏相对平稳。</EmptyState>
            ) : null}
          </div>
        </div>

        <div className="sunny-maintenance-panel">
          <div className="sunny-maintenance-head">
            <div>
              <p className="sunny-kicker text-[0.62rem] text-muted">最近完成</p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">完成沉淀</h3>
            </div>
            <span className="sunny-dashboard-count">{snapshot.plans.done.length} 项</span>
          </div>

          <div className="sunny-dashboard-list mt-3">
            {snapshot.plans.done.length > 0 ? (
              snapshot.plans.done.slice(0, 4).map((plan) => (
                <Link key={plan.id} href={`/admin/collections/plans/${plan.id}`} className="sunny-dashboard-row sunny-maintenance-row">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{plan.title}</h4>
                    <StatusBadge tone={planPriorityToneMap[plan.priority]}>{planPriorityLabelMap[plan.priority]}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted">更新于 {formatDateTime(plan.updatedAt, locale)}</p>
                </Link>
              ))
            ) : (
              <EmptyState>完成态计划会沉淀在这里，方便之后回看。</EmptyState>
            )}
          </div>
        </div>

        <div className="sunny-maintenance-panel">
          <div className="sunny-maintenance-head">
            <div>
              <p className="sunny-kicker text-[0.62rem] text-muted">基础检查</p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">还没完成的基础项</h3>
            </div>
            <span className="sunny-dashboard-count">{pendingOnboardingTasks.length} 项</span>
          </div>

          <div className="sunny-dashboard-list mt-3">
            {pendingOnboardingTasks.length > 0 ? (
              pendingOnboardingTasks.map((task) => (
                <Link key={task.title} href={task.href} className="sunny-dashboard-row sunny-maintenance-row">
                  <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{task.title}</h4>
                  <p className="sunny-dashboard-clamp mt-1 text-xs leading-5 text-muted">{task.description}</p>
                </Link>
              ))
            ) : (
              <EmptyState>基础骨架已经补齐，可以直接把重心放到计划推进和内容发布上。</EmptyState>
            )}
          </div>
        </div>

        <div className="sunny-maintenance-panel sunny-account-panel">
          <p className="sunny-kicker text-[0.62rem] text-muted">账号</p>
          <p className="mt-2 break-all text-sm font-semibold text-foreground">{snapshot.user.email}</p>
          <p className="sunny-dashboard-clamp mt-2 text-xs leading-5 text-muted">
            节奏、缺口和下一步集中在这里；编辑发布仍在 Admin。
          </p>
        </div>
      </div>
    </section>
  );
}
