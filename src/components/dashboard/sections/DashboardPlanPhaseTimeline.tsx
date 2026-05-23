import type { Plan } from "@/payload-types";
import { SectionHeader, StatusBadge } from "@/components/ui/SunnyComponents";

type PhaseData = {
  title: string;
  goal: string;
  estimatedDays: number;
  milestones?: Array<{ title: string; tasks?: string[]; estimatedHours: number }>;
};

type DashboardPlanPhaseTimelineProps = {
  embedded?: boolean;
  plan: Plan;
};

export function DashboardPlanPhaseTimeline({ embedded, plan }: DashboardPlanPhaseTimelineProps) {
  const phases = (plan.phases as PhaseData[] | null | undefined) ?? [];

  if (!Array.isArray(phases) || phases.length === 0) return null;

  const totalTasks = phases.reduce(
    (sum, p) => sum + (p.milestones?.reduce((s, m) => s + (m.tasks?.length ?? 0), 0) ?? 0),
    0,
  );

  const content = (
    <>
      {!embedded ? (
        <SectionHeader
          kicker="阶段时间线"
          title={`「${plan.title}」`}
          description={
            plan.totalEstimatedDays
              ? `${phases.length} 个阶段 · ${plan.totalEstimatedDays} 天 · ${totalTasks} 个任务`
              : `${phases.length} 个阶段 · ${totalTasks} 个任务`
          }
        />
      ) : (
        <p className="mb-3 text-sm font-semibold text-foreground">{plan.title}</p>
      )}

      <div className={embedded ? "" : "mt-4"}>
        {plan.weeklyRhythm ? (
          <p className="mb-4 text-sm text-muted">节奏：{plan.weeklyRhythm}</p>
        ) : null}

        <div className="relative">
          {/* 纵向连接线 */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

          <div className="grid gap-4">
            {phases.map((phase, index) => (
              <div key={index} className="relative flex gap-4">
                {/* 节点圆点 */}
                <div
                  className={`relative z-10 mt-1.5 h-3 w-3 flex-shrink-0 rounded-full border-2 ${
                    index === 0
                      ? "border-accent bg-accent/20"
                      : "border-border bg-background"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      阶段{index + 1}：{phase.title}
                    </h4>
                    <StatusBadge tone="neutral">{phase.estimatedDays} 天</StatusBadge>
                  </div>

                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {phase.goal}
                  </p>

                  {phase.milestones && phase.milestones.length > 0 ? (
                    <div className="mt-2 grid gap-1.5">
                      {phase.milestones.map((milestone, mIndex) => (
                        <div
                          key={mIndex}
                          className="rounded-md border border-border/60 bg-surface/40 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {milestone.title}
                            </span>
                            <span className="text-xs text-muted">
                              {milestone.estimatedHours}h
                            </span>
                          </div>
                          {milestone.tasks && milestone.tasks.length > 0 ? (
                            <ul className="mt-1 grid gap-0.5">
                              {milestone.tasks.map((task, tIndex) => (
                                <li
                                  key={tIndex}
                                  className="text-xs leading-relaxed text-muted before:mr-1 before:text-accent before:content-['·']"
                                >
                                  {task}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return <section className="sunny-dashboard-card">{content}</section>;
}
