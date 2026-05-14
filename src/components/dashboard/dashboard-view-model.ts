import type { Plan } from "@/payload-types";

import type { SiteLocale } from "@/lib/site-copy";
import type { WorkspaceSnapshot } from "@/lib/payload/workspace";

import type { FocusItem, FocusMetricKey, QueueDescriptor } from "@/components/dashboard/dashboard-page-constants";
import { getDueDayOffset } from "@/components/dashboard/dashboard-page-helpers";
import type { StatusBadgeTone } from "@/components/ui/SunnyComponents";

export type DashboardPageViewModel = {
  contentQueues: QueueDescriptor[];
  continueWritingHref: string;
  continueWritingLabel: string;
  displayName: string;
  draftContentWithoutPlans: WorkspaceSnapshot["execution"]["recentContentWithoutPlans"];
  dueSoonPlans: Array<{ dayOffset: number; plan: Plan }>;
  fullAgentHref: string;
  initialThreadId?: number;
  locale: SiteLocale;
  metricToneFor: (metricKey: FocusMetricKey, hasAttention: boolean) => StatusBadgeTone;
  overduePlans: Array<{ dayOffset: number; plan: Plan }>;
  pendingOnboardingTasks: WorkspaceSnapshot["onboarding"]["tasks"];
  primaryFocusItem: FocusItem;
  secondaryActionItems: FocusItem[];
  showFullAgentConsole: boolean;
  snapshot: WorkspaceSnapshot;
};

export const buildDashboardPageViewModel = (input: {
  initialThreadId?: number;
  locale: SiteLocale;
  showFullAgentConsole: boolean;
  snapshot: WorkspaceSnapshot;
}): DashboardPageViewModel => {
  const { initialThreadId, locale, showFullAgentConsole, snapshot } = input;
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

  return {
    contentQueues,
    continueWritingHref,
    continueWritingLabel,
    displayName,
    draftContentWithoutPlans,
    dueSoonPlans,
    fullAgentHref,
    initialThreadId,
    locale,
    metricToneFor,
    overduePlans,
    pendingOnboardingTasks,
    primaryFocusItem,
    secondaryActionItems,
    showFullAgentConsole,
    snapshot,
  };
};
