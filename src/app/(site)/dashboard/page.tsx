import Link from "next/link";
import { revalidatePath } from "next/cache";

import type { Plan } from "@/payload-types";

import { AgentChatPanel } from "@/components/dashboard/AgentChatPanel";
import { FocusActionCard } from "@/components/dashboard/DashboardPrimitives";
import {
  DashboardMetricCard,
  EmptyState,
  QuickActionCard,
  SectionHeader,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/SunnyComponents";
import { buildAgentQuickPrompts } from "@/lib/agent/quick-prompts";
import {
  getPendingAgentSuggestions,
  syncAgentSuggestionsFromWorkspaceSnapshot,
} from "@/lib/agent/suggestions";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { getWorkspaceSnapshot, type WorkspaceSnapshot } from "@/lib/payload/workspace";
import {
  formatScheduleTimeRange,
  updateScheduleItemStatus,
  type ScheduleItemRecord,
  type ScheduleItemStatus,
} from "@/lib/schedule/items";
import { getSiteLocale } from "@/lib/site-locale";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    agent?: string;
    threadId?: string;
  }>;
};

const parseThreadId = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
};

const quickCreateActions = [
  {
    description: "文章",
    href: "/admin/collections/posts/create",
    label: "新建文章",
  },
  {
    description: "短记",
    href: "/admin/collections/notes/create",
    label: "新建短札",
  },
  {
    description: "动态",
    href: "/admin/collections/updates/create",
    label: "新建动态",
  },
  {
    description: "节点",
    href: "/admin/collections/timeline-events/create",
    label: "新建时间线",
  },
  {
    description: "目标",
    href: "/admin/collections/plans/create",
    label: "新建计划",
  },
  {
    description: "任务",
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

const planColumns = [
  {
    actionLabel: "继续推进",
    empty: "还没有正在推进的计划。",
    key: "active",
    label: "正在推进",
  },
  {
    actionLabel: "安排启动",
    empty: "待开始计划会在这里排队。",
    key: "backlog",
    label: "待开始",
  },
  {
    actionLabel: "恢复评估",
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

const relationToneMap: Record<string, StatusBadgeTone> = {
  checklists: "warning",
  notes: "accent",
  pages: "info",
  posts: "success",
  "timeline-events": "danger",
  updates: "warning",
};

const visibilityMetaMap: Record<"private" | "public", { label: string; tone: StatusBadgeTone }> = {
  private: { label: "私有", tone: "neutral" },
  public: { label: "公开", tone: "success" },
};

const planPriorityLabelMap: Record<NonNullable<Plan["priority"]>, string> = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
};

const planPriorityToneMap: Record<NonNullable<Plan["priority"]>, StatusBadgeTone> = {
  high: "danger",
  low: "neutral",
  medium: "info",
};

const planStatusLabelMap: Record<NonNullable<Plan["status"]>, string> = {
  draft: "草稿",
  published: "已发布",
};

const planStatusToneMap: Record<NonNullable<Plan["status"]>, StatusBadgeTone> = {
  draft: "warning",
  published: "success",
};

const planStateToneMap: Record<Plan["state"], StatusBadgeTone> = {
  active: "success",
  backlog: "warning",
  done: "neutral",
  paused: "accent",
};

const scheduleStatusLabelMap: Record<ScheduleItemStatus, string> = {
  canceled: "已取消",
  done: "已完成",
  planned: "计划中",
  skipped: "已跳过",
};

const scheduleStatusToneMap: Record<ScheduleItemStatus, StatusBadgeTone> = {
  canceled: "neutral",
  done: "success",
  planned: "info",
  skipped: "warning",
};

const schedulePriorityToneMap: Record<ScheduleItemRecord["priority"], StatusBadgeTone> = {
  high: "danger",
  low: "neutral",
  medium: "info",
};

type LinkedContentItem = NonNullable<Plan["linkedContent"]>[number];
type FocusMetricKey = "drafts" | "planOutputs" | "timeline";
type FocusItem = {
  actionLabel: string;
  href: string;
  metricKey?: FocusMetricKey;
  summary: string;
  title: string;
  tone: StatusBadgeTone;
};

type QueueDescriptor = {
  actionHref: string;
  actionLabel: string;
  empty: string;
  items: WorkspaceSnapshot["execution"]["recentEdited"];
  kicker: string;
  title: string;
};

const dayInMs = 1000 * 60 * 60 * 24;

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

async function updateScheduleStatusAction(formData: FormData) {
  "use server";

  const id = Number(formData.get("id"));
  const status = formData.get("status");

  if (!Number.isFinite(id) || (status !== "done" && status !== "skipped")) {
    return;
  }

  await updateScheduleItemStatus(id, status);
  revalidatePath("/dashboard");
}

const getScheduleRelationLabel = (item: ScheduleItemRecord) => {
  if (item.relatedPlan) {
    const title = typeof item.relatedPlan === "number" ? `计划 #${item.relatedPlan}` : item.relatedPlan.title;

    return title ? `计划：${title}` : "关联计划";
  }

  if (item.relatedChecklist) {
    const title = typeof item.relatedChecklist === "number" ? `清单 #${item.relatedChecklist}` : item.relatedChecklist.title;

    return title ? `清单：${title}` : "关联清单";
  }

  return item.sourceType === "agent" ? "Agent 安排" : "手动日程";
};

function ContentQueueCard({
  actionHref,
  actionLabel,
  empty,
  items,
  kicker,
  locale,
  title,
}: QueueDescriptor & { locale: Awaited<ReturnType<typeof getSiteLocale>> }) {
  return (
    <div className="sunny-content-operation-lane">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="sunny-kicker text-[0.68rem] text-muted">{kicker}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
        </div>
        <span className="sunny-dashboard-count">{items.length}</span>
      </div>

      <div className="sunny-dashboard-list mt-4">
        {items.length > 0 ? (
          items.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={item.href}
              className="sunny-dashboard-row sunny-content-operation-row"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h4>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone={relationToneMap[item.kind] ?? "neutral"}>{relationLabelMap[item.kind]}</StatusBadge>
                  <StatusBadge tone={visibilityMetaMap[item.visibility].tone}>{visibilityMetaMap[item.visibility].label}</StatusBadge>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">更新：{formatDateTime(item.updatedAt, locale)}</p>
            </Link>
          ))
        ) : (
          <EmptyState>{empty}</EmptyState>
        )}
      </div>

      <div className="mt-3">
        <Link className="sunny-dashboard-link" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function ScheduleDayPanel({
  empty,
  items,
  kicker,
  title,
}: {
  empty: string;
  items: ScheduleItemRecord[];
  kicker: string;
  title: string;
}) {
  return (
    <div className="sunny-schedule-day-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="sunny-kicker text-[0.68rem] text-muted">{kicker}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
        </div>
        <span className="sunny-dashboard-count">{items.length} 项</span>
      </div>

      <div className="sunny-schedule-list mt-4">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="sunny-schedule-row">
              <div className="sunny-schedule-time">
                <strong>{formatScheduleTimeRange(item)}</strong>
                <span>{item.isAllDay ? "All day" : item.startTime && item.endTime ? "Time block" : "Flexible"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={scheduleStatusToneMap[item.status]}>{scheduleStatusLabelMap[item.status]}</StatusBadge>
                    <StatusBadge tone={schedulePriorityToneMap[item.priority]}>{planPriorityLabelMap[item.priority]}</StatusBadge>
                  </div>
                </div>
                <p className="sunny-dashboard-clamp mt-1 text-xs leading-5 text-muted">
                  {item.description || getScheduleRelationLabel(item)}
                </p>
                <p className="mt-1 text-xs text-muted">{getScheduleRelationLabel(item)}</p>
                {item.conflictNote ? <p className="sunny-schedule-conflict mt-2 text-xs">{item.conflictNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={updateScheduleStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className="sunny-gap-action-primary">
                      完成
                    </button>
                  </form>
                  <form action={updateScheduleStatusAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value="skipped" />
                    <button type="submit" className="sunny-gap-action-secondary">
                      跳过
                    </button>
                  </form>
                  <Link href={`/admin/collections/schedule-items/${item.id}`} className="sunny-gap-action-secondary">
                    改期
                  </Link>
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState>{empty}</EmptyState>
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { agent, threadId } = await searchParams;
  const initialThreadId = parseThreadId(threadId);
  const showFullAgentConsole = agent === "full";
  const locale = await getSiteLocale();
  const snapshot = await getWorkspaceSnapshot();
  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);
  const agentSuggestions = await getPendingAgentSuggestions(3);
  const agentQuickPrompts = buildAgentQuickPrompts(snapshot);
  const displayName = snapshot.user.displayName || snapshot.user.email;
  const nextUndoneOnboardingTask = snapshot.onboarding.tasks.find((task) => !task.done);
  const plansNeedingOutputs = snapshot.execution.plansWithoutOutputs.filter((plan) => plan.state === "active");
  const draftContentWithoutPlans = snapshot.execution.recentContentWithoutPlans.filter((item) => item.status === "draft");
  const actionableFocusItems: FocusItem[] = [];

  if (plansNeedingOutputs[0]) {
    actionableFocusItems.push({
      actionLabel: "补产出",
      href: "/admin/collections/plans",
      metricKey: "planOutputs",
      summary: "这项进行中的计划还没有挂住任何文章、短札、动态或页面。",
      title: `先让「${plansNeedingOutputs[0].title}」出现第一条成果`,
      tone: "warning",
    });
  }

  if (draftContentWithoutPlans[0]) {
    actionableFocusItems.push({
      actionLabel: "去关联",
      href: "/admin/collections/plans",
      metricKey: "drafts",
      summary: `「${draftContentWithoutPlans[0].title}」已经开始写了，但还没有归到任何计划里。`,
      title: "把最近的草稿挂回计划流",
      tone: "warning",
    });
  }

  if (snapshot.execution.timelineCandidates[0]) {
    actionableFocusItems.push({
      actionLabel: "补节点",
      href: "/admin/collections/timeline-events",
      metricKey: "timeline",
      summary: `最近更新的「${snapshot.execution.timelineCandidates[0].title}」还没进入 Timeline。`,
      title: "把最近的重要变化补进时间线",
      tone: "success",
    });
  }

  if (nextUndoneOnboardingTask) {
    actionableFocusItems.push({
      actionLabel: "去完成",
      href: nextUndoneOnboardingTask.href,
      summary: nextUndoneOnboardingTask.description,
      title: nextUndoneOnboardingTask.title,
      tone: "info",
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

  const contentQueues: QueueDescriptor[] = [
    {
      actionHref: "/admin",
      actionLabel: "查看最近编辑",
      empty: "最近还没有新的内容改动。",
      items: snapshot.execution.recentEdited.slice(0, 4),
      kicker: "内容运营",
      title: "最新工作台",
    },
    {
      actionHref: "/admin",
      actionLabel: "查看全部草稿",
      empty: "最近没有待处理草稿，可以直接开始新内容。",
      items: snapshot.execution.recentDrafts.slice(0, 4),
      kicker: "内容运营",
      title: "待整理草稿",
    },
    {
      actionHref: "/admin",
      actionLabel: "查看私有内容",
      empty: "暂时没有只留在后台的已完成内容。",
      items: snapshot.execution.recentPrivateReady.slice(0, 4),
      kicker: "内容运营",
      title: "私有待发内容",
    },
    {
      actionHref: "/",
      actionLabel: "查看公开站点",
      empty: "最近还没有新的公开内容流转出来。",
      items: snapshot.execution.recentPublicContent.slice(0, 4),
      kicker: "内容运营",
      title: "最近公开内容",
    },
  ];

  const fallbackFocusItem: FocusItem = {
    actionLabel: "整理节奏",
    href: snapshot.plans.active[0] ? `/admin/collections/plans/${snapshot.plans.active[0].id}` : "/admin/collections/plans",
    summary: "当前没有突出的内容缺口，适合回到计划板确认今天最小的一步推进。",
    title: "从计划板挑一个今天能完成的小动作",
    tone: "success",
  };
  const primaryFocusItem = actionableFocusItems[0] ?? fallbackFocusItem;
  const secondaryActionItems = actionableFocusItems.slice(1);
  const metricToneFor = (metricKey: FocusMetricKey, hasAttention: boolean): StatusBadgeTone =>
    primaryFocusItem.metricKey === metricKey && hasAttention ? "warning" : "neutral";
  const continueWritingTarget = snapshot.execution.recentDrafts[0];
  const continueWritingHref = continueWritingTarget?.href ?? "/admin/collections/posts/create";
  const continueWritingLabel = continueWritingTarget ? "继续写草稿" : "新建文章";
  const fullAgentHref = initialThreadId
    ? `/dashboard?agent=full&threadId=${initialThreadId}`
    : "/dashboard?agent=full";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 md:px-7 lg:px-8">
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
              kicker="Today Focus"
              title="最值得先做的一件事"
              action={<StatusBadge tone={primaryFocusItem.tone}>{primaryFocusItem.actionLabel}</StatusBadge>}
            />
            <div className="mt-4">
              <FocusActionCard strong {...primaryFocusItem} />
            </div>
          </div>
        </div>
      </section>

      <section aria-label="关键状态" className="sunny-dashboard-metric-strip">
        <DashboardMetricCard
          description={`${snapshot.counts.activePlansWithoutOutputs} 项活跃计划还没有产出内容。`}
          label="活跃计划"
          tone={metricToneFor("planOutputs", snapshot.counts.activePlansWithoutOutputs > 0)}
          value={snapshot.counts.activePlans}
        />
        <DashboardMetricCard
          description="最近开始写、适合优先清掉的内容总数。"
          label="草稿积压"
          tone={metricToneFor("drafts", draftContentWithoutPlans.length > 0)}
          value={snapshot.counts.draftSurfaces}
        />
        <DashboardMetricCard
          description="当前已在前台可见的内容总数。"
          label="公开内容"
          value={snapshot.counts.publicSurfaces}
        />
        <DashboardMetricCard
          description={`${snapshot.counts.recentTimelineCandidates} 条变化还没进入 Timeline。`}
          label="叙事缺口"
          tone={metricToneFor("timeline", snapshot.counts.recentTimelineCandidates > 0)}
          value={snapshot.execution.timelineCandidates.length}
        />
      </section>

      <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-schedule-section">
        <SectionHeader
          kicker="Daily Schedule"
          title="今天与明天"
          description="Agent 创建的日程会先落在这里，方便把计划变成当天可执行的时间块。"
          action={
            <Link className="sunny-dashboard-link" href="/admin/collections/schedule-items">
              打开日程
            </Link>
          }
        />
        <div className="sunny-schedule-grid mt-5">
          <ScheduleDayPanel
            empty="今天还没有日程。可以让 Agent 说“帮我安排今天”。"
            items={snapshot.schedule.today}
            kicker="Today Schedule"
            title="今日日程"
          />
          <ScheduleDayPanel
            empty="明天还没有安排。可以说“把这个计划放到明天上午”。"
            items={snapshot.schedule.tomorrow}
            kicker="Tomorrow Preview"
            title="明日预览"
          />
        </div>
      </section>

      {showFullAgentConsole ? (
        <section>
          <AgentChatPanel
            initialThreadId={initialThreadId}
            quickPrompts={agentQuickPrompts}
            suggestions={agentSuggestions}
            variant="full"
          />
        </section>
      ) : null}

      <div className={`grid gap-5 xl:items-start ${showFullAgentConsole ? "" : "xl:grid-cols-[minmax(0,1fr)_22rem]"}`}>
        <div className="flex min-w-0 flex-col gap-6">
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
                    <FocusActionCard
                      compact
                      key={`${item.title}-${item.href}`}
                      index={index}
                      {...item}
                    />
                  ))
                ) : (
                  <EmptyState>
                    暂时没有第二优先级动作。先把上方那一件事推进就好。
                  </EmptyState>
                )}
              </div>
            </div>

            <div className="sunny-dashboard-card sunny-dashboard-quick-card self-start">
              <SectionHeader
                kicker="快速创建"
                title="点进去就开始写"
                description="常用入口压成紧凑动作，减少在 Admin 里找入口的时间。"
                action={<span className="sunny-dashboard-count">Create</span>}
              />

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {quickCreateActions.map((item) => (
                  <QuickActionCard
                    compact
                    key={item.href}
                    description={item.description}
                    href={item.href}
                    title={item.label}
                  />
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

          <section className="sunny-dashboard-card sunny-plan-runway">
            <SectionHeader
              kicker="Plan Runway"
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

          <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-content-operations">
            <SectionHeader
              kicker="Content Operations"
              title="内容运营"
              description="草稿、私有待发和公开内容用轻量行处理；这里更像编辑台，不再是一排同权重卡片。"
              action={
                <span className="sunny-dashboard-count">
                  {contentQueues.reduce((total, queue) => total + queue.items.length, 0)} 条
                </span>
              }
            />

            <div className="sunny-content-operations-grid mt-5">
              {contentQueues.map((queue) => (
                <ContentQueueCard key={queue.title} locale={locale} {...queue} />
              ))}
            </div>
          </section>

          <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-timeline-gap-panel sunny-narrative-gap-panel">
            <SectionHeader
              kicker="Narrative Gaps"
              title="还没进入 Timeline 的变化"
              description="这些内容已经发生变化，但还没有被写进时间线；补节点会让 SunnyPanel 的叙事记忆更完整。"
              action={<span className="sunny-dashboard-count">{snapshot.execution.timelineCandidates.length} 条</span>}
            />

            <div className="sunny-dashboard-list sunny-narrative-gap-list mt-4">
              {snapshot.execution.timelineCandidates.length > 0 ? (
                snapshot.execution.timelineCandidates.slice(0, 5).map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="sunny-dashboard-row sunny-timeline-gap-row">
                    <div className="sunny-timeline-gap-marker" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <h3 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h3>
                        <StatusBadge tone={relationToneMap[item.kind] ?? "neutral"}>{relationLabelMap[item.kind]}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-muted">更新：{formatDateTime(item.updatedAt, locale)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link className="sunny-gap-action-secondary" href={item.href}>
                          打开内容
                        </Link>
                        <Link className="sunny-gap-action-primary" href="/admin/collections/timeline-events/create">
                          新建节点
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState>
                  最近的重要变化都已经整理进 Timeline。
                </EmptyState>
              )}
            </div>
          </section>

          <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-maintenance-section">
            <SectionHeader
              kicker="Review & Maintenance"
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
                    <EmptyState>
                      最近 7 天内没有临近截止的计划，节奏相对平稳。
                    </EmptyState>
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
                    <EmptyState>
                      基础骨架已经补齐，可以直接把重心放到计划推进和内容发布上。
                    </EmptyState>
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
        </div>

        {showFullAgentConsole ? null : (
          <aside className="max-xl:order-first xl:sticky xl:top-5">
            <AgentChatPanel
              fullConsoleHref={fullAgentHref}
              initialThreadId={initialThreadId}
              quickPrompts={agentQuickPrompts}
              suggestions={agentSuggestions}
              variant="sidebar"
            />
          </aside>
        )}
      </div>
    </main>
  );
}
