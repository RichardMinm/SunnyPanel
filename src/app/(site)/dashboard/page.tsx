import Link from "next/link";

import type { Plan } from "@/payload-types";

import { formatDate, formatDateTime, formatShortDate } from "@/lib/formatters";
import { getWorkspaceSnapshot } from "@/lib/payload/workspace";

const workspaceShortcuts = [
  {
    href: "/admin/collections/posts",
    label: "写文章",
    description: "长文发布、摘要整理和封面配置。",
  },
  {
    href: "/admin/collections/notes",
    label: "记录 Note",
    description: "碎片、短想法和轻量记录。",
  },
  {
    href: "/admin/collections/updates",
    label: "记录 Update",
    description: "工作、生活与项目推进的短日志。",
  },
  {
    href: "/admin/collections/timeline-events",
    label: "新增时间线节点",
    description: "把阶段节点挂到公开叙事主轴上。",
  },
  {
    href: "/admin/collections/plans",
    label: "管理 Plans",
    description: "私有目标、当前优先级与轻量规划。",
  },
  {
    href: "/admin/collections/media",
    label: "上传媒体",
    description: "统一管理全站图片和文件资源。",
  },
  {
    href: "/admin/collections/pages",
    label: "管理页面",
    description: "About、Now 和其他长期存在的公开页面。",
  },
  {
    href: "/admin/collections/checklists",
    label: "管理清单",
    description: "分组学习清单、任务树和可回看的完成记录。",
  },
];

const workspaceTracks = [
  {
    title: "内容运营",
    body: "Admin 负责录入、发布和媒体管理，Dashboard 负责把这些动作重新组织成更适合日常推进的总览。",
  },
  {
    title: "计划层",
    body: "Plans 已经有了状态流转，所以这里更像工作台，而不是单纯的数据列表。",
  },
  {
    title: "回顾节奏",
    body: "Timeline 和 Updates 已经会自动承接公开侧内容，因此这里更强调推进和回看，而不是逐条编辑。",
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
  paused: "bg-violet-100 text-violet-700",
  private: "bg-stone-200 text-stone-700",
  public: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-100 text-emerald-700",
};

const planColumns = [
  {
    empty: "还没有处于 active 状态的计划。",
    key: "active",
    label: "正在推进",
  },
  {
    empty: "待推进计划会在这里聚合，适合用来排队和排序。",
    key: "backlog",
    label: "待推进",
  },
  {
    empty: "暂停状态适合先冻结，不必从系统里删除。",
    key: "paused",
    label: "暂停中",
  },
] as const;

const getTone = (value: string) => statusTone[value] ?? "bg-stone-200 text-stone-700";

const relationLabelMap: Record<string, string> = {
  checklists: "Checklist",
  notes: "Note",
  pages: "Page",
  posts: "Post",
  "timeline-events": "Timeline",
  updates: "Update",
};

const contentKindLabelMap = {
  checklists: "Checklist",
  notes: "Note",
  pages: "Page",
  posts: "Post",
  "timeline-events": "Timeline",
  updates: "Update",
} as const;

type LinkedContentItem = NonNullable<Plan["linkedContent"]>[number];

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
          label: relationLabelMap[relationTo] ?? "Content",
          title: `#${value}`,
        };
      }

      if ("title" in value && typeof value.title === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "Content",
          title: value.title,
        };
      }

      if ("content" in value && typeof value.content === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "Content",
          title: value.content,
        };
      }

      if ("type" in value && typeof value.type === "string") {
        return {
          label: relationLabelMap[relationTo] ?? "Content",
          title: value.type,
        };
      }

      return null;
    })
    .filter((item): item is { label: string; title: string } => Boolean(item));

export default async function DashboardPage() {
  const snapshot = await getWorkspaceSnapshot();
  const displayName = snapshot.user.displayName || snapshot.user.email;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 md:px-10 lg:px-12">
      <section className="sunny-card sunny-card-strong rounded-[2.3rem] p-8 md:p-10">
        <div className="flex flex-wrap gap-3">
          <span className="sunny-chip">私有工作台</span>
          <span className="sunny-chip">计划流转已接入</span>
          <span className="sunny-chip">总览优先，不做逐条编辑</span>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p className="sunny-kicker text-xs text-muted">Private workspace</p>
            <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
              Dashboard
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
              你好，{displayName}。这里负责看整体推进情况、执行缺口和最近变化；
              `Admin` 则负责真正去创建、编辑和发布内容。两者相关，但职责并不一样。
            </p>
          </div>

          <div className="sunny-panel rounded-[1.9rem] p-6">
            <p className="sunny-kicker text-xs text-muted">今天概览</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[1.4rem] border border-border bg-white/55 p-4">
                <p className="text-sm text-muted">活跃计划</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{snapshot.counts.activePlans}</p>
                <p className="mt-2 text-sm text-muted">
                  其中 {snapshot.counts.activePlansWithoutOutputs} 项还没有挂住内容产出。
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-border bg-white/55 p-4">
                <p className="text-sm text-muted">草稿积压</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{snapshot.counts.draftSurfaces}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="sunny-button-primary"
            href="/admin"
          >
            进入 Admin 编辑
          </Link>
          <Link
            className="sunny-button-secondary"
            href="/timeline"
          >
            查看公开时间线
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sunny-card rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,245,230,0.72))] p-6">
          <p className="sunny-kicker text-xs text-muted">Plans</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">{snapshot.counts.plans}</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            {snapshot.counts.activePlans} 个 active 计划正在推进，{snapshot.counts.highPriorityPlans} 个属于高优先级。
          </p>
        </div>

        <div className="sunny-card rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(238,246,243,0.8))] p-6">
          <p className="sunny-kicker text-xs text-muted">Plan flow</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">
            {snapshot.counts.backlogPlans}
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            当前 backlog 里有 {snapshot.counts.backlogPlans} 项，暂停 {snapshot.counts.pausedPlans} 项，已完成 {snapshot.counts.completedPlans} 项。
          </p>
        </div>

        <div className="sunny-card rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(246,238,224,0.82))] p-6">
          <p className="sunny-kicker text-xs text-muted">Draft backlog</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">
            {snapshot.counts.draftSurfaces}
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            其中 Post 草稿 {snapshot.counts.draftPosts} 篇，其余来自短文、动态和时间线。
          </p>
        </div>

        <div className="sunny-card rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(235,242,240,0.78))] p-6">
          <p className="sunny-kicker text-xs text-muted">Execution</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">
            {snapshot.counts.plansWithOutputs}
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            已经挂住内容产出的计划有 {snapshot.counts.plansWithOutputs} 项，仍缺少输出的计划还有 {snapshot.counts.plansWithoutOutputs} 项。
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Execution gaps</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Plans still waiting for output</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("draft")}`}>
              {snapshot.counts.plansWithoutOutputs}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.plansWithoutOutputs.length > 0 ? (
              snapshot.execution.plansWithoutOutputs.map((plan) => (
                <div key={plan.id} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{plan.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.state)}`}>
                        {plan.state}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}>
                        {plan.priority}
                      </span>
                    </div>
                  </div>
                  {plan.description ? (
                    <p className="mt-3 text-sm leading-7 text-muted">{plan.description}</p>
                  ) : null}
                  <p className="mt-3 text-sm text-muted">
                    这项计划还没有挂接到 Post、Note、Update、Timeline 或 Page。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans">
                      更新计划关联
                    </Link>
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin">
                      去创建内容
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                当前计划都已经至少挂住了一项内容产出，工作流已经开始成形。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Shipping now</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Plans already producing content</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("published")}`}>
              {snapshot.counts.plansWithOutputs}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.plansWithOutputs.length > 0 ? (
              snapshot.execution.plansWithOutputs.map((plan) => (
                <div key={plan.id} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{plan.title}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.state)}`}>
                      {plan.state}
                    </span>
                  </div>
                  {plan.description ? (
                    <p className="mt-3 text-sm leading-7 text-muted">{plan.description}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {getLinkedContent(plan).map((item) => (
                      <span
                        key={`${plan.id}-${item.label}-${item.title}`}
                        className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]"
                      >
                        {item.label}: {item.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                还没有计划真正挂住内容成果。给任意计划关联一个 Post、Page 或 Timeline 节点后，这里就会开始形成“产出视图”。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="sunny-card rounded-[2.1rem] p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sunny-kicker text-xs text-muted">Timeline candidates</p>
            <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent content not yet folded into the narrative spine</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("draft")}`}>
            {snapshot.counts.recentTimelineCandidates}
          </span>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {snapshot.execution.timelineCandidates.length > 0 ? (
            snapshot.execution.timelineCandidates.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]">
                      {contentKindLabelMap[item.kind]}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">
                  最近更新：{formatDateTime(item.updatedAt)}。如果它代表一个阶段节点，可以考虑把它挂到 Timeline。
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sunny-button-secondary px-4 py-2 text-sm" href={item.href}>
                    打开内容
                  </Link>
                  <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/timeline-events">
                    新建 Timeline 节点
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted xl:col-span-2">
              最近的 Post 和 Update 都已经被整理进 Timeline，叙事主轴没有出现新的空档。
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Orphan content</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent content not linked to a plan</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("draft")}`}>
              {snapshot.counts.recentContentWithoutPlans}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.recentContentWithoutPlans.length > 0 ? (
              snapshot.execution.recentContentWithoutPlans.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]">
                        {contentKindLabelMap[item.kind]}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    最近更新：{formatDateTime(item.updatedAt)}。这条内容还没有挂接到任何 Plan。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href={item.href}>
                      打开内容
                    </Link>
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans">
                      关联到计划
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                最近的内容都已经归到了计划里，内容和执行层没有出现新的脱节。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Linked recently</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent content already inside the workflow</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("published")}`}>
              {snapshot.counts.recentContentWithPlans}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.execution.recentContentWithPlans.length > 0 ? (
              snapshot.execution.recentContentWithPlans.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]">
                        {contentKindLabelMap[item.kind]}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    最近更新：{formatDateTime(item.updatedAt)}。这条内容已经被纳入某个 Plan。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href={item.href}>
                      打开内容
                    </Link>
                    <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans">
                      查看计划
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                还没有最近内容被稳定挂到计划上。先把一条新内容关联到某个 Plan，这里就会开始出现真正的工作流痕迹。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">First-use flow</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Next actions</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {snapshot.onboarding.completed}/{snapshot.onboarding.total}
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            {snapshot.onboarding.tasks.map((task) => (
              <Link
                key={task.title}
                href={task.href}
                className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{task.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted">{task.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${task.done ? getTone("published") : getTone("draft")}`}
                  >
                    {task.done ? "Done" : "Pending"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <p className="sunny-kicker text-xs text-muted">Why this matters</p>
          <h2 className="sunny-display mt-2 text-3xl text-foreground">Keep the first week lightweight</h2>

          <div className="mt-6 space-y-4 text-sm leading-7 text-muted">
            <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
              现在系统已经会自动帮你准备 `About`、`Now` 和第一组私有计划，所以首次使用不再从空白 collection 开始。
            </div>
            <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
              建议先完成一条公开内容、一条时间线节点，再回头继续打磨页面视觉。这样更容易验证产品方向是否成立。
            </div>
            <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
              当这些最小内容都落下之后，dashboard 才会开始真正体现“公开表达 + 私有运营”的双层价值。
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Quick operations</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Start from here</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              Admin shortcuts
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {workspaceShortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[1.6rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
              >
                <span className="sunny-badge sunny-badge-muted">Shortcut</span>
                <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <p className="sunny-kicker text-xs text-muted">Build notes</p>
          <h2 className="sunny-display mt-2 text-3xl text-foreground">What this dashboard is doing</h2>

          <div className="mt-6 space-y-5 text-sm leading-7 text-muted">
            {workspaceTracks.map((item, index) => (
              <div key={item.title} className="rounded-[1.6rem] border border-border bg-white/55 p-5">
                <span className="sunny-badge sunny-badge-accent">0{index + 1}</span>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Plans</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Plan board</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/plans">
                Open all plans
              </Link>
              <Link className="sunny-button-secondary px-4 py-2 text-sm" href="/admin/collections/plans/create">
                New plan
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
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}
                              >
                                {plan.priority}
                              </span>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.status)}`}
                              >
                                {plan.status}
                              </span>
                            </div>
                          </div>

                          {plan.description ? (
                            <p className="mt-3 text-sm leading-7 text-muted">{plan.description}</p>
                          ) : null}

                          {getLinkedContent(plan).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {getLinkedContent(plan).map((item) => (
                                <span
                                  key={`${plan.id}-${item.label}-${item.title}`}
                                  className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]"
                                >
                                  {item.label}: {item.title}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <p className="mt-3 text-sm text-muted">
                            截止日期：{formatDate(plan.dueDate)}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                              className="sunny-button-secondary px-4 py-2 text-sm"
                              href={`/admin/collections/plans/${plan.id}`}
                            >
                              编辑计划
                            </Link>
                            <Link
                              className="sunny-button-secondary px-4 py-2 text-sm"
                              href="/admin"
                            >
                              去关联内容
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
            <p className="sunny-kicker text-xs text-muted">Account</p>
            <p className="mt-4 text-lg font-semibold text-foreground">{snapshot.user.email}</p>
            <p className="mt-3 text-sm leading-7 text-muted">
              账户创建于 {formatShortDate(snapshot.user.createdAt)}，最近可继续从这里切到 Admin。
            </p>
          </div>

          <div className="sunny-card rounded-[2.1rem] p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Completed</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">Done recently</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone("done")}`}>
                {snapshot.plans.done.length}
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {snapshot.plans.done.length > 0 ? (
                snapshot.plans.done.slice(0, 5).map((plan) => (
                  <div key={plan.id} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}
                      >
                        {plan.priority}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted">
                      更新于 {formatDateTime(plan.updatedAt)}
                    </p>
                    {getLinkedContent(plan).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {getLinkedContent(plan).map((item) => (
                          <span
                            key={`${plan.id}-${item.label}-${item.title}`}
                            className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-[0_2px_10px_rgba(24,34,44,0.06)]"
                          >
                            {item.label}: {item.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <Link
                        className="sunny-button-secondary px-4 py-2 text-sm"
                        href={`/admin/collections/plans/${plan.id}`}
                      >
                        查看计划详情
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted">
                  完成态计划会在这里沉淀，方便你之后回看阶段性成果。
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="sunny-card rounded-[2.1rem] p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sunny-kicker text-xs text-muted">Editorial queue</p>
            <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent long-form work</h2>
          </div>
          <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/posts">
            Manage posts
          </Link>
        </div>

        <div className="mt-6 space-y-4">
          {snapshot.recentPosts.length > 0 ? (
            snapshot.recentPosts.map((post) => (
              <div key={post.id} className="rounded-[1.6rem] border border-border bg-white/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{post.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(post.status)}`}>
                      {post.status}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(post.visibility)}`}>
                      {post.visibility}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">{post.summary}</p>
                <p className="mt-3 text-sm text-muted">
                  最近更新：{formatDateTime(post.updatedAt)}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
              Post collection 已连通。等你创建内容后，这里会显示最近编辑的长文。
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Notes</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent fragments</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/notes">
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentNotes.length > 0 ? (
              snapshot.recentNotes.map((note) => (
                <div key={note.id} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{note.category}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(note.status)}`}>
                      {note.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{note.content}</p>
                  <p className="mt-3 text-sm text-muted">更新于 {formatDateTime(note.updatedAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">最近还没有短文片段。</p>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Updates</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent movement</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/updates">
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentUpdates.length > 0 ? (
              snapshot.recentUpdates.map((update) => (
                <div key={update.id} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{update.type}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(update.status)}`}>
                      {update.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{update.content}</p>
                  <p className="mt-3 text-sm text-muted">更新于 {formatDateTime(update.updatedAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">最近还没有动态记录。</p>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2.1rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Timeline</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent milestones</h2>
            </div>
            <Link
              className="text-sm font-semibold text-accent-strong"
              href="/admin/collections/timeline-events"
            >
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentTimelineEvents.length > 0 ? (
              snapshot.recentTimelineEvents.map((event) => (
                <div key={event.id} className="rounded-[1.35rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{event.title}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(event.status)}`}>
                      {event.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {formatShortDate(event.eventDate)} | 类型：{event.type}
                  </p>
                  {event.description ? (
                    <p className="mt-3 text-sm leading-7 text-muted">{event.description}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">时间线还没有内部记录。</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
