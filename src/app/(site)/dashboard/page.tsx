import Link from "next/link";

import { DashboardWorkspaceChrome } from "@/components/dashboard/DashboardWorkspaceChrome";
import { quickCreateActions } from "@/components/dashboard/dashboard-page-constants";
import { FocusActionCard } from "@/components/dashboard/DashboardPrimitives";
import { DashboardAgentChatFullSection } from "@/components/dashboard/sections/DashboardAgentChatFullSection";
import { DashboardCalendarSection } from "@/components/dashboard/sections/DashboardCalendarSection";
import { DashboardContentQueuesSection } from "@/components/dashboard/sections/DashboardContentQueuesSection";
import { DashboardKeyMetricsStrip } from "@/components/dashboard/sections/DashboardKeyMetricsStrip";
import { DashboardPlanRunwaySection } from "@/components/dashboard/sections/DashboardPlanRunwaySection";
import { DashboardPlanPhaseTimeline } from "@/components/dashboard/sections/DashboardPlanPhaseTimeline";
import { parseWeekParam } from "@/components/dashboard/calendar-utils";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";
import { QuickActionCard } from "@/components/ui/SunnyComponents";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    threadId?: string;
    week?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const weekStart = parseWeekParam(params.week ?? null);
  const { agentQuickPrompts, agentSuggestions, model, weekSchedule } = await loadDashboardData(params);

  return (
    <main className="sunny-dashboard-shell">
      <DashboardWorkspaceChrome />
      <div className="sunny-dashboard-triple">
        {/* ── 左栏：焦点 + 内容 + 快捷操作 + 计划跑道 ── */}
        <aside className="sunny-dashboard-col-left">
          {/* 问候 + 焦点行动 */}
          <details className="sunny-collapsible-card" open>
            <summary>工作台 · {model.displayName}</summary>
            <div className="sunny-collapsible-body">
              <div className="mb-3">
                <FocusActionCard strong {...model.primaryFocusItem} />
              </div>
              <Link className="sunny-button-primary w-full text-center" href={model.continueWritingHref}>
                {model.continueWritingLabel}
              </Link>
            </div>
          </details>

          {/* 快捷新建 */}
          <details className="sunny-collapsible-card">
            <summary>快捷新建</summary>
            <div className="sunny-collapsible-body grid gap-1.5 sm:grid-cols-2">
              {quickCreateActions.map((item) => (
                <QuickActionCard compact key={item.href} description={item.description} href={item.href} title={item.label} />
              ))}
            </div>
          </details>

          {/* 次要行动 */}
          {model.secondaryActionItems.length > 0 ? (
            <details className="sunny-collapsible-card">
              <summary>次要行动（{model.secondaryActionItems.length}）</summary>
              <div className="sunny-collapsible-body grid gap-2">
                {model.secondaryActionItems.map((item, index) => (
                  <FocusActionCard compact key={`${item.title}-${item.href}`} index={index} {...item} />
                ))}
              </div>
            </details>
          ) : null}

          {/* 内容队列 */}
          <details className="sunny-collapsible-card">
            <summary>内容队列</summary>
            <div className="sunny-collapsible-body">
              <DashboardContentQueuesSection compact embedded model={model} />
            </div>
          </details>

          {/* 计划跑道 */}
          <details className="sunny-collapsible-card">
            <summary>计划跑道</summary>
            <div className="sunny-collapsible-body">
              <DashboardPlanRunwaySection embedded model={model} />
            </div>
          </details>
        </aside>

        {/* ── 中间：Agent 工作台 ── */}
        <DashboardAgentChatFullSection
          initialThreadId={model.initialThreadId}
          quickPrompts={agentQuickPrompts}
          suggestions={agentSuggestions}
        />

        {/* ── 右栏：日历 + 指标 + 阶段时间线 ── */}
        <aside className="sunny-dashboard-col-right">
          <DashboardCalendarSection
            compact
            today={new Date()}
            weekSchedule={weekSchedule}
            weekStart={weekStart}
          />

          <DashboardKeyMetricsStrip compact model={model} />

          {(() => {
            const planWithPhases = model.snapshot.plans.active.find(
              (plan) => Array.isArray(plan.phases) && plan.phases.length > 0,
            );

            if (!planWithPhases) {
              return null;
            }

            return (
              <details className="sunny-collapsible-card">
                <summary>阶段时间线</summary>
                <div className="sunny-collapsible-body">
                  <DashboardPlanPhaseTimeline embedded plan={planWithPhases} />
                </div>
              </details>
            );
          })()}
        </aside>
      </div>
    </main>
  );
}
