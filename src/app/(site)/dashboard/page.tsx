import Link from "next/link";

import type { Plan } from "@/payload-types";

import { formatDate, formatDateTime } from "@/lib/formatters";
import { getWorkspaceSnapshot } from "@/lib/payload/workspace";

const quickCreateActions = [
  {
    description: "标题、摘要和正文。",
    href: "/admin/collections/posts/create",
    label: "新建文章",
  },
  {
    description: "一句想法或一段短记。",
    href: "/admin/collections/notes/create",
    label: "新建短札",
  },
  {
    description: "记录最近的推进变化。",
    href: "/admin/collections/updates/create",
    label: "新建动态",
  },
  {
    description: "补一个阶段节点。",
    href: "/admin/collections/timeline-events/create",
    label: "新建时间线",
  },
  {
    description: "先立一个要推进的目标。",
    href: "/admin/collections/plans/create",
    label: "新建计划",
  },
  {
    description: "建立章节式任务清单。",
    href: "/admin/collections/checklists/create",
    label: "新建清单",
  },
];

const quickManageActions = [
  {
    href: "/admin/collections/pages/create",
    label: "新建页面",
  },
  {
    href: "/admin/collections/media/create",
    label: "上传媒体",
  },
  {
    href: "/admin",
    label: "打开 Admin",
  },
];

const statusTone: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  backlog: "bg-amber-100 text-amber-800",
  done: "bg-slate-200 text-slate-700",
  draft: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-700",
  low: "bg-stone-200 text-stone-700",
  medium: "bg-sky-100 text-sky-700",
  overdue: "bg-rose-100 text-rose-700",
  paused: "bg-violet-100 text-violet-700",
  private: "bg-stone-200 text-stone-700",
  public: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-100 text-emerald-700",
};

const planColumns = [
  {
    empty: "还没有正在推进的计划。",
    key: "active",
    label: "正在推进",
  },
  {
    empty: "待开始计划会在这里排队。",
    key: "backlog",
    label: "待开始",
  },
  {
    empty: "暂停计划会先停在这里。",
    key: "paused",
    label: "暂停中",
  },
] as const;

const relationLabelMap: Record<string, string> = {
  checklists: "清单",
  notes: "短札",
  pages: "页面",
  posts: "文章",
  "timeline-events": "时间线",
  updates: "动态",
};

type LinkedContentItem = NonNullable<Plan["linkedContent"]>[number];
type FocusItem = {
  actionLabel: string;
  href: string;
  summary: string;
  title: string;
  tone: keyof typeof statusTone;
};

const dayInMs = 1000 * 60 * 60 * 24;

const getTone = (value: string) => statusTone[value] ?? "bg-stone-200 text-stone-700";

const getLinkedContent = (plan: Plan) =>
  ((plan.linkedContent ?? []) as LinkedContentItem[])
    .map((item: LinkedContentItem) => {
      if (!item || typeof item !== "object" || !("relationTo" in item)) {
        return null;
      }

      const relationTo = item.relationTo;
      const value = item.value;

      if (!value || typeof value === "number") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: `#${value}`,
        };
      }

      if ("title" in value && typeof value.title === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.title,
        };
      }

      if ("content" in value && typeof value.content === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.content,
        };
      }

      if ("type" in value && typeof value.type === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "内容",
          title: value.type,
        };
      }

      return null;
    })
    .filter((item): item is { label: string; title: string } => Boolean(item));

const getDueDayOffset = (value?: null | string) => {
  if (!value) {
    return null;
  }

  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  return Math.round((startOfDueDate.getTime() - startOfToday.getTime()) / dayInMs);
};

export default async function DashboardPage() {
  const snapshot = await getWorkspaceSnapshot();
  const displayName = snapshot.user.displayName || snapshot.user.email;
  const nextUndoneOnboardingTask = snapshot.onboarding.tasks.find((task) => !task.done);
  const plansNeedingOutputs = snapshot.execution.plansWithoutOutputs.filter((plan) => plan.state === "active");
  const draftContentWithoutPlans = snapshot.execution.recentContentWithoutPlans.filter((item) => item.status === "draft");
  const actionableFocusItems: FocusItem[] = [];

  if (plansNeedingOutputs[0]) {
    actionableFocusItems.push({
      actionLabel: "补产出",
      href: "/admin/collections/plans",
      summary: "这项进行中的计划还没有挂住任何文章、短札、动态或页面。",
      title: `先让「${plansNeedingOutputs[0].title}」出现第一条成果`,
      tone: "draft",
    });
  }

  if (draftContentWithoutPlans[0]) {
    actionableFocusItems.push({
      actionLabel: "去关联",
      href: "/admin/collections/plans",
      summary: `「${draftContentWithoutPlans[0].title}」已经开始写了，但还没有归到任何计划里。`,
      title: "把最近的草稿挂回计划流",
      tone: "backlog",
    });
  }

  if (snapshot.execution.timelineCandidates[0]) {
    actionableFocusItems.push({
      actionLabel: "补节点",
      href: "/admin/collections/timeline-events",
      summary: `最近更新的「${snapshot.execution.timelineCandidates[0].title}」还没进入 Timeline。`,
      title: "把最近的重要变化补进时间线",
      tone: "published",
    });
  }

  if (nextUndoneOnboardingTask) {
    actionableFocusItems.push({
      actionLabel: "去完成",
      href: nextUndoneOnboardingTask.href,
      summary: nextUndoneOnboardingTask.description,
      title: nextUndoneOnboardingTask.title,
      tone: "medium",
    });
  }

  const plansWithDeadlines = [...snapshot.plans.active, ...snapshot.plans.backlog, ...snapshot.plans.paused]
    .filter((plan) => Boolean(plan.dueDate))
    .map((plan) => ({
      dayOffset: getDueDayOffset(plan.dueDate),
      plan,
    }))
    .filter((item): item is { dayOffset: number; plan: Plan } => item.dayOffset !== null)
    .sort((a, b) => a.dayOffset - b.dayOffset);

  const overduePlans = plansWithDeadlines.filter((item) => item.dayOffset < 0).slice(0, 3);
  const dueSoonPlans = plansWithDeadlines.filter((item) => item.dayOffset >= 0 && item.dayOffset <= 7).slice(0, 3);
  const pendingOnboardingTasks = snapshot.onboarding.tasks.filter((task) => !task.done).slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 md:px-10 lg:px-12">
      <section className="sunny-card sunny-card-strong rounded-[2.3rem] p-8 md:p-10">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="sunny-kicker text-xs text-muted">私有工作台</p>
            <h1 className="sunny-display mt-3 text-4xl leading-none text-foreground md:text-6xl">
              Dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
              你好，{displayName}。这里尽量只保留最值得处理的计划、提醒和创建入口，让你打开后就能开始做事。
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sunny-button-primary" href="/admin">
                进入 Admin
              </Link>
              <Link className="sunny-button-secondary" href="/timeline">
                查看公开时间线
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[1.5rem] border border-border bg-white/60 p-5">
              <p className="text-sm text-muted">活跃计划</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{snapshot.counts.activePlans}</p>
              <p className="mt-2 text-sm text-muted">
                {snapshot.counts.activePlansWithoutOutputs} 项还没有内容产出。
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-white/60 p-5">
              <p className="text-sm text-muted">草稿积压</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{snapshot.counts.draftSurfaces}</p>
              <p className="mt-2 text-sm text-muted">适合优先清掉最近开始写的内容。</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-white/60 p-5">
              <p className="text-sm text-muted">公开内容</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{snapshot.counts.publicSurfaces}</p>
              <p className="mt-2 text-sm text-muted">站点目前已经对外可见的内容总数。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">今日聚焦</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">先做这些</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">优先队列</span>
          </div>

          <div className="mt-6 grid gap-4">
            {actionableFocusItems.length > 0 ? (
              actionableFocusItems.map((item) => (
                <Link
                  key={`${item.title}-${item.href}`}
                  href={item.href}
                  className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted">{item.summary}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(item.tone)}`}>
                      {item.actionLabel}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                当前没有特别突出的缺口，可以直接去下方快速创建，或者回看计划板继续推进。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">快速创建</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">点进去就开始写</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">Create</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {quickCreateActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
              >
                <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {quickManageActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-border bg-white/75 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">截止提醒</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">快到期和已逾期</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {overduePlans.length + dueSoonPlans.length} 项
            </span>
          </div>

          <div className="mt-6 space-y-4 text-sm leading-7 text-muted">
            {overduePlans.map(({ dayOffset, plan }) => (
              <div key={`overdue-${plan.id}`} className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("overdue")}`}>
                    已逾期 {Math.abs(dayOffset)} 天
                  </span>
                </div>
                <p className="mt-2">原定截止：{formatDate(plan.dueDate)}。</p>
              </div>
            ))}

            {dueSoonPlans.map(({ dayOffset, plan }) => (
              <div key={`soon-${plan.id}`} className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.state)}`}>
                    {dayOffset === 0 ? "今天到期" : `${dayOffset} 天内到期`}
                  </span>
                </div>
                <p className="mt-2">截止日期：{formatDate(plan.dueDate)}。</p>
              </div>
            ))}

            {overduePlans.length === 0 && dueSoonPlans.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                最近 7 天内没有临近截止的计划，节奏相对平稳。
              </div>
            ) : null}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">基础检查</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">还没完成的基础项</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {pendingOnboardingTasks.length} 项
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            {pendingOnboardingTasks.length > 0 ? (
              pendingOnboardingTasks.map((task) => (
                <Link
                  key={task.title}
                  href={task.href}
                  className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
                >
                  <h3 className="text-base font-semibold text-foreground">{task.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{task.description}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                基础骨架已经补齐，可以直接把重心放到计划推进和内容发布上。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">内容待处理</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">最近草稿和未归档内容</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {snapshot.execution.recentContentWithoutPlans.length} 条
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.recentContentWithoutPlans.length > 0 ? (
              snapshot.execution.recentContentWithoutPlans.slice(0, 4).map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]">
                        {relationLabelMap[item.kind]}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">最近更新：{formatDateTime(item.updatedAt)}</p>
                  <div className="mt-4">
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href={item.href}>
                      打开内容
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                最近没有游离内容，计划和内容的关联状态比较完整。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">叙事补位</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">还没进入 Timeline 的变化</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {snapshot.execution.timelineCandidates.length} 条
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.timelineCandidates.length > 0 ? (
              snapshot.execution.timelineCandidates.slice(0, 4).map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]">
                      {relationLabelMap[item.kind]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">最近更新：{formatDateTime(item.updatedAt)}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href={item.href}>
                      打开内容
                    </Link>
                    <Link
                      className="sunny-button-secondary px-4 py-2 text-sm"
                      href="/admin/collections/timeline-events/create"
                    >
                      新建节点
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                最近的重要变化都已经整理进 Timeline。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">计划板</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">当前计划状态</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/plans">
                打开全部计划
              </Link>
              <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans/create">
                新建计划
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {planColumns.map((column) => {
              const plans = snapshot.plans[column.key];

              return (
                <div
                  key={column.key}
                  className="rounded-[1.65rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.64),rgba(250,244,236,0.66))] p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{column.label}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(column.key)}`}>
                      {plans.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    {plans.length > 0 ? (
                      plans.map((plan) => (
                        <div key={plan.id} className="rounded-[1.35rem] border border-border bg-white/72 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className="text-base font-semibold text-foreground">{plan.title}</h4>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}>
                                {plan.priority}
                              </span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.status)}`}>
                                {plan.status}
                              </span>
                            </div>
                          </div>

                          {plan.description ? (
                            <p className="mt-3 text-sm leading-7 text-muted">{plan.description}</p>
                          ) : null}

                          {getLinkedContent(plan).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {getLinkedContent(plan).slice(0, 3).map((item) => (
                                <span
                                  key={`${plan.id}-${item.label}-${item.title}`}
                                  className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]"
                                >
                                  {item.label}: {item.title}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                              className="sunny-button-secondary px-4 py-2 text-sm"
                              href={`/admin/collections/plans/${plan.id}`}
                            >
                              编辑计划
                            </Link>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-7 text-muted">{column.empty}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="sunny-card rounded-[2.1rem] p-8">
            <p className="sunny-kicker text-xs text-muted">最近完成</p>
            <h2 className="sunny-display mt-2 text-3xl text-foreground">Done recently</h2>

            <div className="mt-6 space-y-4">
              {snapshot.plans.done.length > 0 ? (
                snapshot.plans.done.slice(0, 4).map((plan) => (
                  <div key={plan.id} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}>
                        {plan.priority}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted">更新于 {formatDateTime(plan.updatedAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted">完成态计划会沉淀在这里，方便之后回看。</p>
              )}
            </div>
          </div>

          <div className="sunny-card rounded-[2.1rem] p-8">
            <p className="sunny-kicker text-xs text-muted">账号</p>
            <p className="mt-4 text-lg font-semibold text-foreground">{snapshot.user.email}</p>
            <p className="mt-3 text-sm leading-7 text-muted">
              需要更细的编辑、筛选和发布操作时，直接进入 Admin 即可。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
