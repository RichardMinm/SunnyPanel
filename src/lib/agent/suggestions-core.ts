export type AgentSuggestionSource =
  | "agent-run"
  | "content"
  | "content-lifecycle"
  | "dashboard"
  | "plan"
  | "review"
  | "timeline";
export type AgentSuggestionRiskLevel = "high" | "low" | "medium";
export type AgentSuggestionStatus = "accepted" | "dismissed" | "done" | "pending";
export type AgentSuggestionCreatedBy = "agent" | "manual";

export type AgentSuggestionRelatedContent = {
  relationTo: "checklists" | "notes" | "pages" | "posts" | "timeline-events" | "updates";
  value: number;
};

export type AgentSuggestionDraft = {
  createdBy: AgentSuggestionCreatedBy;
  reason: string;
  relatedContent?: AgentSuggestionRelatedContent[];
  relatedPlan?: number;
  riskLevel: AgentSuggestionRiskLevel;
  source: AgentSuggestionSource;
  status: AgentSuggestionStatus;
  suggestedPrompt: string;
  title: string;
  uniqueKey: string;
};

type SnapshotPlan = {
  agentBrief?: null | string;
  dueDate?: null | string;
  executionMode?: null | "agent" | "hybrid" | "manual" | string;
  id: number;
  priority?: string;
  state: "active" | "backlog" | "done" | "paused" | string;
  title: string;
};

type SnapshotContentItem = {
  id: number;
  kind: AgentSuggestionRelatedContent["relationTo"];
  status: "draft" | "published" | string;
  title: string;
  updatedAt?: string;
  visibility: "private" | "public" | string;
};

type SnapshotAgentRun = {
  id: number;
  status: string;
  summary?: null | string;
  title: string;
  workflow?: string;
};

type SnapshotPlanReview = {
  reviewedAt?: null | string;
};

export type AgentSuggestionSnapshot = {
  agent: {
    recentReviews: SnapshotPlanReview[];
    recentRuns: SnapshotAgentRun[];
  };
  execution: {
    recentContentWithoutPlans: SnapshotContentItem[];
    recentPrivateReady: SnapshotContentItem[];
    recentPublicContent?: SnapshotContentItem[];
    timelineCandidates: SnapshotContentItem[];
  };
  plans: {
    active: SnapshotPlan[];
    backlog: SnapshotPlan[];
    paused: SnapshotPlan[];
  };
};

export const dismissedSuggestionCooldownMs = 1000 * 60 * 60 * 24 * 7;

const quote = (value: string) => `「${value}」`;

const dayInMs = 1000 * 60 * 60 * 24;

const contentRelation = (item: SnapshotContentItem): AgentSuggestionRelatedContent => ({
  relationTo: item.kind,
  value: item.id,
});

const timelineComposerSourceType = (item: SnapshotContentItem) => {
  const sourceTypeMap: Record<SnapshotContentItem["kind"], "checklist_item" | "note" | "post" | "update" | "free_text"> = {
    checklists: "checklist_item",
    notes: "note",
    pages: "free_text",
    posts: "post",
    "timeline-events": "free_text",
    updates: "update",
  };

  return sourceTypeMap[item.kind];
};

const parseDate = (value?: null | string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isOverduePlan = (plan: SnapshotPlan, now: Date) => {
  if (plan.state === "done" || !plan.dueDate) {
    return false;
  }

  const dueDate = parseDate(plan.dueDate);
  const todayStart = new Date(now);

  todayStart.setHours(0, 0, 0, 0);

  return Boolean(dueDate && dueDate.getTime() < todayStart.getTime());
};

const isWeeklyReviewDue = (snapshot: AgentSuggestionSnapshot, now: Date) => {
  const recentReview = snapshot.agent.recentReviews
    .map((review) => parseDate(review.reviewedAt))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return !recentReview || now.getTime() - recentReview.getTime() >= 7 * dayInMs;
};

const pushUnique = (suggestions: AgentSuggestionDraft[], suggestion: AgentSuggestionDraft) => {
  if (suggestions.some((item) => item.uniqueKey === suggestion.uniqueKey)) {
    return;
  }

  suggestions.push(suggestion);
};

const createBaseSuggestion = (suggestion: Omit<AgentSuggestionDraft, "createdBy" | "status">): AgentSuggestionDraft => ({
  ...suggestion,
  createdBy: "agent",
  status: "pending",
});

export const shouldResurfaceDismissedSuggestion = ({
  dismissedAt,
  now = new Date(),
}: {
  dismissedAt?: null | string;
  now?: Date;
}) => {
  const dismissedDate = parseDate(dismissedAt);

  if (!dismissedDate) {
    return true;
  }

  return now.getTime() - dismissedDate.getTime() >= dismissedSuggestionCooldownMs;
};

export const generateSuggestionsFromWorkspaceSnapshot = (
  snapshot: AgentSuggestionSnapshot,
  now = new Date(),
): AgentSuggestionDraft[] => {
  const suggestions: AgentSuggestionDraft[] = [];
  const plans = [...snapshot.plans.active, ...snapshot.plans.backlog, ...snapshot.plans.paused];
  const overduePlan = plans.find((plan) => isOverduePlan(plan, now));
  const contentKey = (item: SnapshotContentItem) => `${item.kind}:${item.id}`;

  // 内容生命周期联动：已公开发布、但还没补时间线 / 没挂计划的内容，是发布后最该被 Agent 接力的对象。
  const publicContent = snapshot.execution.recentPublicContent ?? [];
  const timelineCandidateKeys = new Set(snapshot.execution.timelineCandidates.map(contentKey));
  const withoutPlanKeys = new Set(snapshot.execution.recentContentWithoutPlans.map(contentKey));
  const publishedNeedingTimeline = publicContent.find(
    (item) => (item.kind === "posts" || item.kind === "updates") && timelineCandidateKeys.has(contentKey(item)),
  );
  const publishedNeedingPlan = publicContent.find((item) => withoutPlanKeys.has(contentKey(item)));
  const planLinkTarget = snapshot.plans.active[0];

  // 已被生命周期建议覆盖的内容，避免与通用「补时间线」候选重复 surfacing。
  const timelineGap = snapshot.execution.timelineCandidates.find(
    (item) => !publishedNeedingTimeline || contentKey(item) !== contentKey(publishedNeedingTimeline),
  );
  const draftWithoutPlan = snapshot.execution.recentContentWithoutPlans.find((item) => item.status === "draft");
  const privateReadyContent = snapshot.execution.recentPrivateReady[0];
  const failedRun = snapshot.agent.recentRuns.find((run) => run.status === "failed");
  const planMissingBrief = plans.find(
    (plan) => (plan.executionMode === "agent" || plan.executionMode === "hybrid") && !plan.agentBrief,
  );

  if (overduePlan) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(overduePlan.title)} 已经过了截止日期，需要先判断是否延期、降 scope 或拆下一步。`,
        relatedPlan: overduePlan.id,
        riskLevel: overduePlan.priority === "high" ? "high" : "medium",
        source: "plan",
        suggestedPrompt: `评估${quote(overduePlan.title)}的逾期风险，并整理下一步止损动作`,
        title: `处理逾期计划：${overduePlan.title}`,
        uniqueKey: `overdue-plan:${overduePlan.id}`,
      }),
    );
  }

  if (timelineGap) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(timelineGap.title)} 最近有更新，但还没有对应 Timeline 节点。`,
        relatedContent: [contentRelation(timelineGap)],
        riskLevel: "low",
        source: "timeline",
        suggestedPrompt: `用 compose_timeline_event 为${quote(timelineGap.title)}生成 Timeline 节点，来源类型 ${timelineComposerSourceType(timelineGap)}，来源 ID ${timelineGap.id}`,
        title: `补时间线节点：${timelineGap.title}`,
        uniqueKey: `timeline-gap:${timelineGap.kind}:${timelineGap.id}`,
      }),
    );
  }

  if (draftWithoutPlan) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(draftWithoutPlan.title)} 还是草稿，而且没有挂到任何计划里。`,
        relatedContent: [contentRelation(draftWithoutPlan)],
        riskLevel: "medium",
        source: "content",
        suggestedPrompt: `整理${quote(draftWithoutPlan.title)}从草稿到发布的下一步，并判断它应该挂到哪个计划`,
        title: `草稿需要归队：${draftWithoutPlan.title}`,
        uniqueKey: `draft-without-plan:${draftWithoutPlan.kind}:${draftWithoutPlan.id}`,
      }),
    );
  }

  if (privateReadyContent) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(privateReadyContent.title)} 已发布但仍是私有，可检查是否适合公开。`,
        relatedContent: [contentRelation(privateReadyContent)],
        riskLevel: "medium",
        source: "content",
        suggestedPrompt: `检查${quote(privateReadyContent.title)}是否适合公开发布`,
        title: `检查私有待发内容：${privateReadyContent.title}`,
        uniqueKey: `private-ready:${privateReadyContent.kind}:${privateReadyContent.id}`,
      }),
    );
  }

  if (publishedNeedingTimeline) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(publishedNeedingTimeline.title)} 已公开发布，但还没有对应的公开时间线节点，补一个能让它进入对外叙事。`,
        relatedContent: [contentRelation(publishedNeedingTimeline)],
        riskLevel: "low",
        source: "content-lifecycle",
        suggestedPrompt: `用 compose_timeline_event 把已发布的${quote(publishedNeedingTimeline.title)}补成公开时间线节点，来源类型 ${timelineComposerSourceType(publishedNeedingTimeline)}，来源 ID ${publishedNeedingTimeline.id}`,
        title: `发布后补时间线：${publishedNeedingTimeline.title}`,
        uniqueKey: `content-lifecycle-timeline:${publishedNeedingTimeline.kind}:${publishedNeedingTimeline.id}`,
      }),
    );
  }

  if (publishedNeedingPlan && planLinkTarget) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(publishedNeedingPlan.title)} 已发布但没有关联到任何计划，挂到${quote(planLinkTarget.title)}能把成果归档到正在推进的目标。`,
        relatedContent: [contentRelation(publishedNeedingPlan)],
        relatedPlan: planLinkTarget.id,
        riskLevel: "low",
        source: "content-lifecycle",
        suggestedPrompt: `把已发布的${quote(publishedNeedingPlan.title)}（来源 ${publishedNeedingPlan.kind} ID ${publishedNeedingPlan.id}）关联到计划${quote(planLinkTarget.title)}（计划 ID ${planLinkTarget.id}），并补一条对应的计划进展`,
        title: `发布成果关联计划：${publishedNeedingPlan.title}`,
        uniqueKey: `content-lifecycle-plan:${publishedNeedingPlan.kind}:${publishedNeedingPlan.id}`,
      }),
    );
  }

  if (failedRun) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(failedRun.title)} 最近执行失败，需要确认失败原因和下一步恢复动作。`,
        riskLevel: "high",
        source: "agent-run",
        suggestedPrompt: `复盘失败的 AgentRun ${quote(failedRun.title)}，整理失败原因和恢复动作`,
        title: `复盘失败运行：${failedRun.title}`,
        uniqueKey: `failed-agent-run:${failedRun.id}`,
      }),
    );
  }

  if (planMissingBrief) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: `${quote(planMissingBrief.title)} 由 Agent 或协作推进，但缺少 agentBrief，后续执行边界不清晰。`,
        relatedPlan: planMissingBrief.id,
        riskLevel: "medium",
        source: "plan",
        suggestedPrompt: `为${quote(planMissingBrief.title)}补一版 AgentBrief，包括目标、边界、输入和验收标准`,
        title: `补 AgentBrief：${planMissingBrief.title}`,
        uniqueKey: `missing-agent-brief:${planMissingBrief.id}`,
      }),
    );
  }

  if (isWeeklyReviewDue(snapshot, now)) {
    pushUnique(
      suggestions,
      createBaseSuggestion({
        reason: "最近 7 天没有新的计划回顾，适合生成一次节奏复盘。",
        riskLevel: "low",
        source: "review",
        suggestedPrompt: "生成本周计划回顾，重点总结风险、完成项和下周最小行动",
        title: "生成本周计划回顾",
        uniqueKey: "weekly-review-due",
      }),
    );
  }

  return suggestions.slice(0, 8);
};
