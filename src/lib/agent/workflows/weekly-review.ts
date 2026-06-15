import type { AgentSuggestionDraft, AgentSuggestionRelatedContent } from "../suggestions-core";
import type { WeeklyReviewArgs } from "../schemas";
import { getCurrentAgentUserId } from "../execution-context";
import { buildAgentRunOwnerWhere } from "../run-access";

type PayloadFindResult<TDoc> = {
  docs: TDoc[];
};

type PayloadCreateArgs = {
  collection: string;
  data: unknown;
  overrideAccess?: boolean;
};

type PayloadFindArgs = {
  collection: string;
  depth?: number;
  limit?: number;
  overrideAccess?: boolean;
  pagination?: boolean;
  sort?: string;
  where?: unknown;
};

export type WeeklyReviewPayload = {
  create: (args: PayloadCreateArgs) => Promise<{ id: number }>;
  find: <TDoc = unknown>(args: PayloadFindArgs) => Promise<PayloadFindResult<TDoc>>;
};

type WeeklyReviewPlan = {
  agentBrief?: null | string;
  dueDate?: null | string;
  executionMode?: null | string;
  id: number;
  linkedContent?: null | unknown[];
  priority?: null | string;
  state: string;
  title: string;
};

type WeeklyReviewChecklist = {
  groups?: null | Array<{
    items?: null | Array<{
      isCompleted?: boolean | null;
      title?: null | string;
    }>;
    title?: null | string;
  }>;
  id: number;
  title: string;
};

type WeeklyReviewTimelineEvent = {
  eventDate?: null | string;
  id: number;
  status?: null | string;
  title: string;
  type?: null | string;
  visibility?: null | string;
};

type WeeklyReviewContentItem = {
  id: number;
  kind: AgentSuggestionRelatedContent["relationTo"];
  status: string;
  title: string;
  updatedAt?: null | string;
  visibility: string;
};

type WeeklyReviewAgentRun = {
  completedAt?: null | string;
  id: number;
  startedAt?: null | string;
  status: string;
  summary?: null | string;
  title: string;
  workflow?: null | string;
};

export type WeeklyReviewSnapshot = {
  agentRuns: WeeklyReviewAgentRun[];
  checklists: WeeklyReviewChecklist[];
  plans: {
    active: WeeklyReviewPlan[];
    backlog: WeeklyReviewPlan[];
    done: WeeklyReviewPlan[];
  };
  recentPublicContent: WeeklyReviewContentItem[];
  recentTimelineEvents: WeeklyReviewTimelineEvent[];
};

export type WeeklyReviewResult = {
  agentRunId?: number;
  assistantMessage: string;
  completed: string[];
  health: "attention" | "healthy" | "risk";
  metrics: Record<string, number | string>;
  narrativeGaps: string[];
  recommendations: string[];
  reviewId?: number;
  risks: string[];
  suggestionDrafts: AgentSuggestionDraft[];
  suggestionIds?: number[];
};

export type WeeklyReviewWorkflowDeps = {
  collectSnapshot?: () => Promise<WeeklyReviewSnapshot>;
  createAgentRun?: (data: unknown) => Promise<{ id: number }>;
  createPlanReview?: (data: unknown) => Promise<{ id: number }>;
  now?: Date | string;
  payload?: WeeklyReviewPayload;
  upsertSuggestion?: (uniqueKey: string, suggestion: AgentSuggestionDraft) => Promise<unknown>;
  userId?: number;
  validateAgentRunData?: (value: unknown) => unknown;
  validatePlanReviewData?: (value: unknown) => unknown;
};

const dayInMs = 1000 * 60 * 60 * 24;

const publicPublishedWhere = {
  and: [
    {
      status: {
        equals: "published",
      },
    },
    {
      visibility: {
        equals: "public",
      },
    },
  ],
};

const toDate = (value?: Date | null | string) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveNow = (value?: Date | string) => toDate(value) ?? new Date();

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const isWithinDays = (value: null | string | undefined, now: Date, days: number) => {
  const date = toDate(value);

  if (!date) {
    return false;
  }

  return now.getTime() - date.getTime() >= 0 && now.getTime() - date.getTime() <= days * dayInMs;
};

const isOverduePlan = (plan: WeeklyReviewPlan, now: Date) => {
  if (plan.state === "done" || !plan.dueDate) {
    return false;
  }

  const dueDate = toDate(plan.dueDate);

  return Boolean(dueDate && startOfDay(dueDate).getTime() < startOfDay(now).getTime());
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const quote = (value: string) => `「${value}」`;

const getChecklistStats = (checklists: WeeklyReviewChecklist[]) => {
  const items = checklists.flatMap((checklist) =>
    (checklist.groups ?? []).flatMap((group) => group.items ?? []),
  );
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.isCompleted).length;

  return {
    completedItems,
    completionRate: totalItems > 0 ? completedItems / totalItems : 0,
    totalItems,
  };
};

const hasLinkedOutputs = (plan: WeeklyReviewPlan) => Array.isArray(plan.linkedContent) && plan.linkedContent.length > 0;

const summarizeList = (items: string[], fallback: string) => {
  if (items.length === 0) {
    return fallback;
  }

  return items.slice(0, 4).join("；");
};

const getWeekKey = (now: Date) => now.toISOString().slice(0, 10);

const createSuggestion = ({
  reason,
  relatedContent,
  relatedPlan,
  riskLevel,
  suggestedPrompt,
  title,
  uniqueKey,
}: Omit<AgentSuggestionDraft, "createdBy" | "source" | "status">): AgentSuggestionDraft => ({
  createdBy: "agent",
  reason,
  ...(relatedContent ? { relatedContent } : {}),
  ...(relatedPlan ? { relatedPlan } : {}),
  riskLevel,
  source: "review",
  status: "pending",
  suggestedPrompt,
  title,
  uniqueKey,
});

const toContentSummary = (
  kind: AgentSuggestionRelatedContent["relationTo"],
  doc: Record<string, unknown>,
): WeeklyReviewContentItem => {
  const text = typeof doc.title === "string" ? doc.title : typeof doc.content === "string" ? doc.content : "Untitled";

  return {
    id: typeof doc.id === "number" ? doc.id : 0,
    kind,
    status: typeof doc.status === "string" ? doc.status : "draft",
    title: text.length <= 56 ? text : `${text.slice(0, 56).trimEnd()}...`,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : null,
    visibility: typeof doc.visibility === "string" ? doc.visibility : "private",
  };
};

export const collectWeeklyReviewSnapshot = async (
  payload: WeeklyReviewPayload,
  options: { userId?: number } = {},
): Promise<WeeklyReviewSnapshot> => {
  const userId = options.userId ?? getCurrentAgentUserId();
  const [
    plans,
    checklists,
    timelineEvents,
    agentRuns,
    posts,
    notes,
    updates,
    pages,
  ] = await Promise.all([
    payload.find<WeeklyReviewPlan>({
      collection: "plans",
      depth: 1,
      limit: 100,
      overrideAccess: true,
      sort: "dueDate",
    }),
    payload.find<WeeklyReviewChecklist>({
      collection: "checklists",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find<WeeklyReviewTimelineEvent>({
      collection: "timeline-events",
      depth: 0,
      limit: 12,
      overrideAccess: true,
      sort: "-eventDate",
    }),
    payload.find<WeeklyReviewAgentRun>({
      collection: "agent-runs",
      depth: 0,
      limit: 12,
      overrideAccess: true,
      sort: "-startedAt",
      where: typeof userId === "number" ? buildAgentRunOwnerWhere(userId) : undefined,
    }),
    payload.find<Record<string, unknown>>({
      collection: "posts",
      depth: 0,
      limit: 8,
      overrideAccess: true,
      sort: "-updatedAt",
      where: publicPublishedWhere,
    }),
    payload.find<Record<string, unknown>>({
      collection: "notes",
      depth: 0,
      limit: 8,
      overrideAccess: true,
      sort: "-updatedAt",
      where: publicPublishedWhere,
    }),
    payload.find<Record<string, unknown>>({
      collection: "updates",
      depth: 0,
      limit: 8,
      overrideAccess: true,
      sort: "-updatedAt",
      where: publicPublishedWhere,
    }),
    payload.find<Record<string, unknown>>({
      collection: "pages",
      depth: 0,
      limit: 8,
      overrideAccess: true,
      sort: "-updatedAt",
      where: publicPublishedWhere,
    }),
  ]);

  const planDocs = plans.docs;

  return {
    agentRuns: agentRuns.docs,
    checklists: checklists.docs,
    plans: {
      active: planDocs.filter((plan) => plan.state === "active"),
      backlog: planDocs.filter((plan) => plan.state === "backlog"),
      done: planDocs.filter((plan) => plan.state === "done"),
    },
    recentPublicContent: [
      ...posts.docs.map((doc) => toContentSummary("posts", doc)),
      ...notes.docs.map((doc) => toContentSummary("notes", doc)),
      ...updates.docs.map((doc) => toContentSummary("updates", doc)),
      ...pages.docs.map((doc) => toContentSummary("pages", doc)),
    ].sort((left, right) => {
      const rightTime = toDate(right.updatedAt)?.getTime() ?? 0;
      const leftTime = toDate(left.updatedAt)?.getTime() ?? 0;

      return rightTime - leftTime;
    }),
    recentTimelineEvents: timelineEvents.docs,
  };
};

export const buildWeeklyReviewFromSnapshot = (
  snapshot: WeeklyReviewSnapshot,
  nowInput: Date | string = new Date(),
): Omit<WeeklyReviewResult, "agentRunId" | "assistantMessage" | "reviewId"> => {
  const now = resolveNow(nowInput);
  const weekKey = getWeekKey(now);
  const checklistStats = getChecklistStats(snapshot.checklists);
  const overduePlans = [...snapshot.plans.active, ...snapshot.plans.backlog].filter((plan) => isOverduePlan(plan, now));
  const activePlansWithoutOutputs = snapshot.plans.active.filter((plan) => !hasLinkedOutputs(plan));
  const recentPublicContent = snapshot.recentPublicContent.filter((item) => isWithinDays(item.updatedAt, now, 7));
  const recentTimelineEvents = snapshot.recentTimelineEvents.filter((event) => isWithinDays(event.eventDate, now, 7));
  const failedRuns = snapshot.agentRuns.filter((run) => run.status === "failed");
  const completed = [
    `${snapshot.plans.done.length} 项计划处于 done`,
    `清单完成 ${checklistStats.completedItems}/${checklistStats.totalItems}`,
    `${recentPublicContent.length} 条公开内容在最近 7 天更新`,
    `${recentTimelineEvents.length} 个 Timeline 节点进入最近 7 天叙事`,
  ];
  const risks: string[] = [];
  const narrativeGaps: string[] = [];
  const recommendations: string[] = [];
  const suggestionDrafts: AgentSuggestionDraft[] = [];

  if (overduePlans.length > 0) {
    risks.push(`${overduePlans.length} 项计划逾期：${summarizeList(overduePlans.map((plan) => plan.title), "未命名计划")}`);
    recommendations.push(`先处理逾期计划 ${quote(overduePlans[0].title)}，明确延期、降 scope 或下一步止损动作。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(overduePlans[0].title)} 在本周回顾中被识别为逾期计划，需要先收敛风险。`,
        relatedPlan: overduePlans[0].id,
        riskLevel: overduePlans[0].priority === "high" ? "high" : "medium",
        suggestedPrompt: `评估${quote(overduePlans[0].title)}的逾期风险，并给出下周最小推进动作`,
        title: `下周先处理逾期计划：${overduePlans[0].title}`,
        uniqueKey: `weekly-review:${weekKey}:overdue-plan:${overduePlans[0].id}`,
      }),
    );
  }

  if (failedRuns.length > 0) {
    risks.push(`${failedRuns.length} 次 AgentRun 失败：${summarizeList(failedRuns.map((run) => run.title), "未命名运行")}`);
    recommendations.push(`复盘失败运行 ${quote(failedRuns[0].title)}，把失败原因和恢复动作写成可执行清单。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(failedRuns[0].title)} 在最近 AgentRun 中失败，会影响后续自动化可靠性。`,
        riskLevel: "high",
        suggestedPrompt: `复盘失败的 AgentRun ${quote(failedRuns[0].title)}，整理失败原因和恢复动作`,
        title: `修复失败运行：${failedRuns[0].title}`,
        uniqueKey: `weekly-review:${weekKey}:failed-agent-run:${failedRuns[0].id}`,
      }),
    );
  }

  if (checklistStats.totalItems >= 5 && checklistStats.completionRate < 0.35) {
    risks.push(`清单完成率偏低：${formatPercent(checklistStats.completionRate)}`);
    recommendations.push("下周先把一份关键清单推进到 50% 以上，再扩新计划。");
  }

  if (activePlansWithoutOutputs.length > 0) {
    narrativeGaps.push(`${activePlansWithoutOutputs.length} 项 active 计划还没有关联产出。`);
    recommendations.push(`给 ${quote(activePlansWithoutOutputs[0].title)} 补一个可见产出或 Timeline 节点。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(activePlansWithoutOutputs[0].title)} 正在推进但缺少可见产出，叙事链条容易断。`,
        relatedPlan: activePlansWithoutOutputs[0].id,
        riskLevel: "medium",
        suggestedPrompt: `为${quote(activePlansWithoutOutputs[0].title)}补一个可见产出或 Timeline 节点`,
        title: `补齐计划叙事：${activePlansWithoutOutputs[0].title}`,
        uniqueKey: `weekly-review:${weekKey}:narrative-gap-plan:${activePlansWithoutOutputs[0].id}`,
      }),
    );
  }

  if (recentPublicContent.length > 0 && recentTimelineEvents.length === 0) {
    narrativeGaps.push("最近 7 天有公开内容，但没有同步形成 Timeline 节点。");
    recommendations.push(`把 ${quote(recentPublicContent[0].title)} 补进 Timeline，让公开产出进入长期叙事。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(recentPublicContent[0].title)} 已公开更新，但本周 Timeline 还没有承接它。`,
        relatedContent: [
          {
            relationTo: recentPublicContent[0].kind,
            value: recentPublicContent[0].id,
          },
        ],
        riskLevel: "low",
        suggestedPrompt: `帮我把${quote(recentPublicContent[0].title)}整理成一个 Timeline 节点`,
        title: `补本周 Timeline：${recentPublicContent[0].title}`,
        uniqueKey: `weekly-review:${weekKey}:timeline-public-content:${recentPublicContent[0].kind}:${recentPublicContent[0].id}`,
      }),
    );
  }

  if (snapshot.plans.active.length > 4) {
    risks.push(`active 计划偏多：${snapshot.plans.active.length} 项`);
    recommendations.push("下周把 active 主线收窄到 2-3 项，减少上下文切换。");
  }

  if (risks.length === 0) {
    risks.push("没有明显硬风险，主要关注节奏延续和产出沉淀。");
  }

  if (narrativeGaps.length === 0) {
    narrativeGaps.push("暂无明显叙事缺口，继续保持 Plan -> Output -> Timeline 的闭环。");
  }

  if (recommendations.length === 0) {
    recommendations.push("下周继续保持当前节奏，优先沉淀一个可公开产出或阶段性 Timeline 节点。");
  }

  if (suggestionDrafts.length === 0) {
    suggestionDrafts.push(
      createSuggestion({
        reason: "本周没有明显硬风险，适合把下周主线先收敛成一个最小行动。",
        riskLevel: "low",
        suggestedPrompt: "帮我选择下周最重要的一条主线，并拆成 3 个最小行动",
        title: "确定下周主线",
        uniqueKey: `weekly-review:${weekKey}:next-focus`,
      }),
    );
  }

  const health = overduePlans.length > 0 || failedRuns.length > 0
    ? "risk"
    : risks.length > 1 || narrativeGaps.some((gap) => gap.includes("没有关联产出"))
      ? "attention"
      : "healthy";

  return {
    completed,
    health,
    metrics: {
      activePlans: snapshot.plans.active.length,
      backlogPlans: snapshot.plans.backlog.length,
      checklistCompletionRate: formatPercent(checklistStats.completionRate),
      completedChecklistItems: checklistStats.completedItems,
      completedPlans: snapshot.plans.done.length,
      failedAgentRuns: failedRuns.length,
      narrativeGaps: narrativeGaps.length,
      overduePlans: overduePlans.length,
      recentPublicContent: recentPublicContent.length,
      recentTimelineEvents: recentTimelineEvents.length,
      totalChecklistItems: checklistStats.totalItems,
    },
    narrativeGaps,
    recommendations: recommendations.slice(0, 5),
    risks,
    suggestionDrafts: suggestionDrafts.slice(0, 4),
  };
};

export const formatWeeklyReviewMessage = (
  review: Omit<WeeklyReviewResult, "assistantMessage">,
) => {
  const savedLine = review.reviewId
    ? `已保存为 PlanReview #${review.reviewId}`
    : "尚未保存为 PlanReview。";

  return [
    `本周完成：${review.completed.join("；")}`,
    `风险：${review.risks.join("；")}`,
    `叙事缺口：${review.narrativeGaps.join("；")}`,
    `下周建议：${review.recommendations.join("；")}`,
    savedLine,
  ].join("\n");
};

export const runWeeklyReviewWorkflow = async (
  args: WeeklyReviewArgs = {},
  deps: WeeklyReviewWorkflowDeps = {},
): Promise<WeeklyReviewResult> => {
  const now = resolveNow(args.now ?? deps.now);
  const payload = deps.payload ?? null;

  if (!deps.collectSnapshot && !payload) {
    throw new Error("Weekly review workflow requires either collectSnapshot or payload.");
  }

  const userId = deps.userId ?? getCurrentAgentUserId();
  const snapshot = deps.collectSnapshot
    ? await deps.collectSnapshot()
    : await collectWeeklyReviewSnapshot(payload as WeeklyReviewPayload, { userId });
  const review = buildWeeklyReviewFromSnapshot(snapshot, now);

  const { enhanceWeeklyReviewWithLLM } = await import("./weekly-review-llm");
  const llmInsights = await enhanceWeeklyReviewWithLLM(review.metrics, review);

  const mergedReview = llmInsights
    ? {
        ...review,
        narrativeGaps: llmInsights.narrativeGaps.length > 0 ? llmInsights.narrativeGaps : review.narrativeGaps,
        recommendations: llmInsights.recommendations.length > 0 ? llmInsights.recommendations : review.recommendations,
        risks: llmInsights.risks.length > 0 ? llmInsights.risks : review.risks,
      }
    : review;

  const assistantMessageBase = llmInsights
    ? [
        llmInsights.summaryTone,
        `本周完成：${mergedReview.completed.join("；")}`,
        `风险：${mergedReview.risks.join("；")}`,
        `叙事缺口：${mergedReview.narrativeGaps.join("；")}`,
        `下周建议：${mergedReview.recommendations.join("；")}`,
      ].join("\n")
    : formatWeeklyReviewMessage(mergedReview);

  if (args.persistReview === false) {
    return {
      ...mergedReview,
      assistantMessage: assistantMessageBase,
    };
  }

  const reviewedAt = now.toISOString();
  const title = `Weekly Review · ${reviewedAt.slice(0, 10)}`;
  const summary = [
    llmInsights?.summaryTone,
    `本周完成：${mergedReview.completed.join("；")}`,
    `风险：${mergedReview.risks.join("；")}`,
    `叙事缺口：${mergedReview.narrativeGaps.join("；")}`,
    `下周建议：${mergedReview.recommendations.join("；")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const rawPlanReviewData = {
    health: mergedReview.health,
    metrics: mergedReview.metrics,
    recommendations: mergedReview.recommendations.map((content) => ({
      content,
    })),
    reviewedAt,
    scope: "overall",
    source: "agent",
    summary,
    title,
  };
  const planReviewData = deps.validatePlanReviewData ? deps.validatePlanReviewData(rawPlanReviewData) : rawPlanReviewData;
  const createPlanReview = deps.createPlanReview ?? ((data) => (payload as WeeklyReviewPayload).create({
    collection: "plan-reviews",
    data,
    overrideAccess: true,
  }));
  const planReview = await createPlanReview(planReviewData);
  const upsertSuggestion = deps.upsertSuggestion;

  const suggestionResults = args.createSuggestions === false
    ? []
    : await Promise.all(
        mergedReview.suggestionDrafts.map((suggestion) => {
          if (!upsertSuggestion) {
            throw new Error("Weekly review workflow requires upsertSuggestion when createSuggestions is enabled.");
          }

          return upsertSuggestion(suggestion.uniqueKey, suggestion);
        }),
      );
  const suggestionIds = suggestionResults
    .map((result) =>
      result && typeof result === "object" && typeof (result as { id?: unknown }).id === "number"
        ? (result as { id: number }).id
        : null,
    )
    .filter((id): id is number => id !== null);
  const rawAgentRunData = {
    afterSnapshot: {
      llmEnhanced: Boolean(llmInsights),
      metrics: mergedReview.metrics,
      recommendationCount: mergedReview.recommendations.length,
      reviewId: planReview.id,
      suggestionKeys: mergedReview.suggestionDrafts.map((suggestion) => suggestion.uniqueKey),
    },
    completedAt: reviewedAt,
    goal: "生成本周回顾，识别完成项、风险、叙事缺口和下周建议",
    nextAction: mergedReview.recommendations[0] ?? null,
    relatedContent: [
      {
        relationTo: "plan-reviews",
        value: planReview.id,
      },
    ],
    startedAt: reviewedAt,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: "已读取 active/backlog/done plans、checklists、timeline、public content 与 AgentRuns。",
        recordedAt: reviewedAt,
      },
      {
        level: review.health === "risk" ? "warn" : "info",
        message: `生成 Weekly Review：health=${mergedReview.health}，suggestions=${suggestionResults.length}`,
        recordedAt: reviewedAt,
      },
    ],
    summary,
    title,
    trigger: "agent",
    user: userId,
    workflow: "weekly-review",
  };
  const agentRunData = deps.validateAgentRunData ? deps.validateAgentRunData(rawAgentRunData) : rawAgentRunData;
  const createAgentRun = deps.createAgentRun ?? ((data) => (payload as WeeklyReviewPayload).create({
    collection: "agent-runs",
    data,
    overrideAccess: true,
  }));
  const agentRun = await createAgentRun(agentRunData);
  const persistedReview = {
    ...mergedReview,
    agentRunId: agentRun.id,
    reviewId: planReview.id,
    suggestionIds,
  };

  return {
    ...persistedReview,
    assistantMessage: assistantMessageBase.includes("本周完成")
      ? `${assistantMessageBase}\n${persistedReview.reviewId ? `已保存为 PlanReview #${persistedReview.reviewId}` : ""}`
      : formatWeeklyReviewMessage(persistedReview),
  };
};
