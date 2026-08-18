import { createHash } from "node:crypto";
import { commitTransaction, createLocalReq, initTransaction, type Payload } from "payload";

import type { AgentSuggestionDraft, AgentSuggestionRelatedContent } from "../suggestions-core";
import type { WeeklyReviewArgs } from "../schemas";
import { getCurrentAgentUserId } from "../execution-context";
import { buildAgentRunOwnerWhere } from "../run-access";
import type { ReviewModelInvocationOptions } from "../review/model-invocation";
import {
  frozenWeeklyReviewProposalSchema,
  type FrozenWeeklyReviewProposal,
  type WeeklyReviewLLMInsights,
} from "../review/model-schemas";

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
  reviewModelInvocation?: ReviewModelInvocationOptions;
  upsertSuggestion?: (uniqueKey: string, suggestion: AgentSuggestionDraft) => Promise<unknown>;
  userId?: number;
  validateAgentRunData?: (value: unknown) => unknown;
  validatePlanReviewData?: (value: unknown) => unknown;
};

export const buildWeeklyReviewRollbackPayload = ({
  planReviewId,
  suggestionIds = [],
}: {
  planReviewId: number;
  suggestionIds?: number[];
}) => ({
  reason:
    "删除本次周复盘和由它新建的行动建议；运行记录保留为回滚审计。",
  strategy: "delete_created_weekly_review_artifacts" as const,
  target: {
    agentRunId: null,
    collection: "plan-reviews" as const,
    planReviewId,
    suggestionIds,
  },
});

export class WeeklyReviewPersistenceIndeterminateError extends Error {
  constructor(cause?: unknown) {
    super("Weekly review persistence rollback failed.", { cause });
    this.name = "WeeklyReviewPersistenceIndeterminateError";
  }
}

export const runWeeklyReviewPersistenceTransaction = async <T>({
  commit,
  operation,
  rollback,
}: {
  commit: () => Promise<void>;
  operation: () => Promise<T>;
  rollback: () => Promise<void>;
}): Promise<T> => {
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    try {
      await rollback();
    } catch {
      throw new WeeklyReviewPersistenceIndeterminateError(error);
    }
    throw error;
  }

  try {
    await commit();
    return result;
  } catch (error) {
    try {
      await rollback();
    } catch {
      throw new WeeklyReviewPersistenceIndeterminateError(error);
    }
    throw error;
  }
};

const rollbackWeeklyReviewTransaction = async (
  payload: Payload,
  req: Awaited<ReturnType<typeof createLocalReq>>,
) => {
  if (req.transactionID == null) return;
  await payload.db.rollbackTransaction(await req.transactionID);
  delete req.transactionID;
};

const createWeeklyReviewSuggestionIfAbsent = async (
  payload: Payload,
  req: Awaited<ReturnType<typeof createLocalReq>>,
  suggestion: AgentSuggestionDraft,
): Promise<null | number> => {
  const existing = await payload.find({
    collection: "agent-suggestions",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      uniqueKey: {
        equals: suggestion.uniqueKey,
      },
    },
  });
  if (existing.docs.length > 0) return null;

  const created = await payload.create({
    collection: "agent-suggestions",
    data: {
      acceptedAt: null,
      completedAt: null,
      createdBy: suggestion.createdBy,
      dismissedAt: null,
      reason: suggestion.reason,
      relatedContent: suggestion.relatedContent,
      relatedPlan: suggestion.relatedPlan,
      riskLevel: suggestion.riskLevel,
      source: suggestion.source,
      status: "pending",
      suggestedPrompt: suggestion.suggestedPrompt,
      title: suggestion.title,
      uniqueKey: suggestion.uniqueKey,
    },
    overrideAccess: true,
    req,
  });

  return created.id;
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
    `${snapshot.plans.done.length} 项计划已完成`,
    `清单完成 ${checklistStats.completedItems}/${checklistStats.totalItems}`,
    `${recentPublicContent.length} 条公开内容在最近 7 天更新`,
    `${recentTimelineEvents.length} 个时间线节点进入最近 7 天记录`,
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
    risks.push(`${failedRuns.length} 次自动任务失败：${summarizeList(failedRuns.map((run) => run.title), "未命名任务")}`);
    recommendations.push(`复盘失败运行 ${quote(failedRuns[0].title)}，把失败原因和恢复动作写成可执行清单。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(failedRuns[0].title)} 最近执行失败，会影响后续自动化可靠性。`,
        riskLevel: "high",
        suggestedPrompt: `复盘失败任务 ${quote(failedRuns[0].title)}，整理失败原因和恢复动作`,
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
    recommendations.push(`给 ${quote(activePlansWithoutOutputs[0].title)} 补一个可见产出或时间线节点。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(activePlansWithoutOutputs[0].title)} 正在推进但缺少可见产出，叙事链条容易断。`,
        relatedPlan: activePlansWithoutOutputs[0].id,
        riskLevel: "medium",
        suggestedPrompt: `为${quote(activePlansWithoutOutputs[0].title)}补一个可见产出或时间线节点`,
        title: `补齐计划叙事：${activePlansWithoutOutputs[0].title}`,
        uniqueKey: `weekly-review:${weekKey}:narrative-gap-plan:${activePlansWithoutOutputs[0].id}`,
      }),
    );
  }

  if (recentPublicContent.length > 0 && recentTimelineEvents.length === 0) {
    narrativeGaps.push("最近 7 天有公开内容，但没有同步形成时间线节点。");
    recommendations.push(`把 ${quote(recentPublicContent[0].title)} 补进时间线，让公开产出进入长期记录。`);
    suggestionDrafts.push(
      createSuggestion({
        reason: `${quote(recentPublicContent[0].title)} 已公开更新，但本周时间线还没有承接它。`,
        relatedContent: [
          {
            relationTo: recentPublicContent[0].kind,
            value: recentPublicContent[0].id,
          },
        ],
        riskLevel: "low",
        suggestedPrompt: `帮我把${quote(recentPublicContent[0].title)}整理成一个时间线节点`,
        title: `补充本周时间线：${recentPublicContent[0].title}`,
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
    narrativeGaps.push("暂无明显记录缺口，继续保持计划、产出和时间线之间的关联。");
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

const appendUnique = (base: string[], additions: string[]) => {
  const seen = new Set(base.map((item) => item.trim()));
  return [
    ...base,
    ...additions.filter((item) => {
      const normalized = item.trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }),
  ];
};

export const mergeWeeklyReviewInsights = <T extends Pick<
  WeeklyReviewResult,
  | "completed"
  | "health"
  | "metrics"
  | "narrativeGaps"
  | "recommendations"
  | "risks"
  | "suggestionDrafts"
>>(
  ruleBased: T,
  insights: WeeklyReviewLLMInsights | null,
): T & { summaryTone?: string } => insights
  ? {
      ...ruleBased,
      narrativeGaps: appendUnique(ruleBased.narrativeGaps, insights.narrativeGaps),
      recommendations: appendUnique(ruleBased.recommendations, insights.recommendations),
      summaryTone: insights.summaryTone,
    }
  : ruleBased;

const buildWeeklyReviewFingerprint = (
  snapshot: WeeklyReviewSnapshot,
  review: Omit<WeeklyReviewResult, "agentRunId" | "assistantMessage" | "reviewId">,
) => createHash("sha256")
  .update(JSON.stringify({ review, snapshot }))
  .digest("hex");

const formatFrozenWeeklyReviewAssistantMessage = ({
  completed,
  narrativeGaps,
  recommendations,
  risks,
  summaryTone,
}: Pick<
  WeeklyReviewResult,
  "completed" | "narrativeGaps" | "recommendations" | "risks"
> & { summaryTone?: string }) => [
  summaryTone,
  `本周完成：${completed.join("；")}`,
  `风险：${risks.join("；")}`,
  `叙事缺口：${narrativeGaps.join("；")}`,
  `下周建议：${recommendations.join("；")}`,
].filter(Boolean).join("\n");

export const prepareWeeklyReviewProposal = async (
  args: WeeklyReviewArgs = {},
  deps: WeeklyReviewWorkflowDeps = {},
): Promise<FrozenWeeklyReviewProposal | null> => {
  const payload = deps.payload ?? null;
  if (!deps.collectSnapshot && !payload) return null;

  const now = resolveNow(args.now ?? deps.now);
  const userId = deps.userId ?? getCurrentAgentUserId();
  const snapshot = deps.collectSnapshot
    ? await deps.collectSnapshot()
    : await collectWeeklyReviewSnapshot(payload as WeeklyReviewPayload, { userId });
  const ruleBased = buildWeeklyReviewFromSnapshot(snapshot, now);
  const { enhanceWeeklyReviewWithLLM } = await import("./weekly-review-llm");
  const insights = await enhanceWeeklyReviewWithLLM(
    ruleBased.metrics,
    ruleBased,
    deps.reviewModelInvocation,
  );
  const merged = mergeWeeklyReviewInsights(ruleBased, insights);
  const reviewedAt = now.toISOString();
  const assistantMessage = formatFrozenWeeklyReviewAssistantMessage(merged);
  const proposal = {
    assistantMessage,
    completed: merged.completed,
    createSuggestions: args.createSuggestions !== false,
    health: merged.health,
    metrics: merged.metrics,
    narrativeGaps: merged.narrativeGaps,
    recommendations: merged.recommendations,
    reviewedAt,
    risks: merged.risks,
    scope: "overall" as const,
    snapshotFingerprint: buildWeeklyReviewFingerprint(snapshot, ruleBased),
    source: insights ? "model" as const : "deterministic" as const,
    suggestionDrafts: merged.suggestionDrafts,
    summary: assistantMessage,
    title: `本周复盘 · ${reviewedAt.slice(0, 10)}`,
  };
  const parsed = frozenWeeklyReviewProposalSchema.safeParse(proposal);
  return parsed.success ? parsed.data : null;
};

export const formatWeeklyReviewMessage = (
  review: Omit<WeeklyReviewResult, "assistantMessage">,
) => {
  const savedLine = review.reviewId
    ? `复盘已保存，编号 #${review.reviewId}`
    : "这次仅生成复盘预览，尚未保存。";

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
  const payload = deps.payload ?? null;
  const userId = deps.userId ?? getCurrentAgentUserId();

  if (args.persistReview === false) {
    const proposal = await prepareWeeklyReviewProposal(args, deps);
    if (!proposal) {
      throw new Error("Weekly review preview could not be prepared.");
    }
    return {
      assistantMessage: proposal.assistantMessage,
      completed: proposal.completed,
      health: proposal.health,
      metrics: proposal.metrics,
      narrativeGaps: proposal.narrativeGaps,
      recommendations: proposal.recommendations,
      risks: proposal.risks,
      suggestionDrafts: proposal.suggestionDrafts,
    };
  }

  const parsedProposal = frozenWeeklyReviewProposalSchema.safeParse(args.proposal);
  if (!parsedProposal.success) {
    throw new Error("Confirmed weekly review proposal is invalid.");
  }
  const proposal = parsedProposal.data;
  const reviewedAt = proposal.reviewedAt;
  const title = proposal.title;
  const summary = proposal.summary;
  const rawPlanReviewData = {
    health: proposal.health,
    metrics: proposal.metrics,
    recommendations: proposal.recommendations.map((content) => ({
      content,
    })),
    reviewedAt,
    scope: proposal.scope,
    source: "agent",
    summary,
    title,
  };
  const planReviewData = deps.validatePlanReviewData ? deps.validatePlanReviewData(rawPlanReviewData) : rawPlanReviewData;
  const buildAgentRunData = (
    planReviewId: number,
    suggestionIds: number[],
  ) => {
    const rollbackPayload = buildWeeklyReviewRollbackPayload({
      planReviewId,
      suggestionIds,
    });
    const rawAgentRunData = {
      afterSnapshot: {
        llmEnhanced: proposal.source === "model",
        metrics: proposal.metrics,
        recommendationCount: proposal.recommendations.length,
        reviewId: planReviewId,
        snapshotFingerprint: proposal.snapshotFingerprint,
        suggestionKeys: proposal.suggestionDrafts.map((suggestion) => suggestion.uniqueKey),
      },
      completedAt: reviewedAt,
      goal: "生成本周回顾，识别完成项、风险、叙事缺口和下周建议",
      nextAction: proposal.recommendations[0] ?? null,
      relatedContent: [
        {
          relationTo: "plan-reviews",
          value: planReviewId,
        },
      ],
      startedAt: reviewedAt,
      rollbackAvailable: true,
      rollbackPayload,
      status: "succeeded",
      steps: [
        {
          level: "info",
          message: "已汇总计划、清单、时间线、公开内容和近期运行记录。",
          recordedAt: reviewedAt,
        },
        {
          level: proposal.health === "risk" ? "warn" : "info",
          message: `已生成本周复盘：${proposal.risks.length} 项风险，${proposal.recommendations.length} 项下周建议。`,
          recordedAt: reviewedAt,
        },
      ],
      summary,
      title,
      trigger: "agent",
      user: userId,
      workflow: "weekly-review",
    };
    return {
      data: deps.validateAgentRunData
        ? deps.validateAgentRunData(rawAgentRunData)
        : rawAgentRunData,
      rollbackPayload,
    };
  };

  let planReview: { id: number };
  let agentRun: { id: number };
  let suggestionIds: number[];

  const useProductionTransaction = Boolean(
    payload
    && !deps.createPlanReview
    && !deps.createAgentRun
    && !deps.upsertSuggestion,
  );

  if (useProductionTransaction) {
    const transactionPayload = payload as unknown as Payload;
    const req = await createLocalReq(
      userId ? { user: { id: userId } as never } : {},
      transactionPayload,
    );
    const started = await initTransaction(req);
    if (!started) throw new Error("Weekly review transaction is unavailable.");

    ({ agentRun, planReview, suggestionIds } = await runWeeklyReviewPersistenceTransaction({
      commit: () => commitTransaction(req),
      operation: async () => {
        const createdReview = await transactionPayload.create({
          collection: "plan-reviews",
          data: planReviewData as never,
          overrideAccess: true,
          req,
        });
        const createdSuggestionIds: number[] = [];
        if (proposal.createSuggestions) {
          for (const suggestion of proposal.suggestionDrafts) {
            const id = await createWeeklyReviewSuggestionIfAbsent(
              transactionPayload,
              req,
              suggestion,
            );
            if (id !== null) createdSuggestionIds.push(id);
          }
        }
        const { data: agentRunData } = buildAgentRunData(
          createdReview.id,
          createdSuggestionIds,
        );
        const createdRun = await transactionPayload.create({
          collection: "agent-runs",
          data: agentRunData as never,
          overrideAccess: true,
          req,
        });
        return {
          agentRun: { id: createdRun.id },
          planReview: { id: createdReview.id },
          suggestionIds: createdSuggestionIds,
        };
      },
      rollback: () => rollbackWeeklyReviewTransaction(transactionPayload, req),
    }));
  } else {
    const createPlanReview = deps.createPlanReview ?? ((data) => (payload as WeeklyReviewPayload).create({
      collection: "plan-reviews",
      data,
      overrideAccess: true,
    }));
    planReview = await createPlanReview(planReviewData);
    const suggestionResults: unknown[] = [];
    if (proposal.createSuggestions) {
      if (!deps.upsertSuggestion) {
        throw new Error("Weekly review workflow requires upsertSuggestion when createSuggestions is enabled.");
      }
      for (const suggestion of proposal.suggestionDrafts) {
        suggestionResults.push(await deps.upsertSuggestion(suggestion.uniqueKey, suggestion));
      }
    }
    suggestionIds = suggestionResults
      .map((result) =>
        result && typeof result === "object" && typeof (result as { id?: unknown }).id === "number"
          ? (result as { id: number }).id
          : null,
      )
      .filter((id): id is number => id !== null);
    const { data: agentRunData } = buildAgentRunData(planReview.id, suggestionIds);
    const createAgentRun = deps.createAgentRun ?? ((data) => (payload as WeeklyReviewPayload).create({
      collection: "agent-runs",
      data,
      overrideAccess: true,
    }));
    agentRun = await createAgentRun(agentRunData);
  }

  const persistedReview = {
    completed: proposal.completed,
    health: proposal.health,
    metrics: proposal.metrics,
    narrativeGaps: proposal.narrativeGaps,
    recommendations: proposal.recommendations,
    risks: proposal.risks,
    suggestionDrafts: proposal.suggestionDrafts,
    agentRunId: agentRun.id,
    reviewId: planReview.id,
    suggestionIds,
  };

  return {
    ...persistedReview,
    assistantMessage: `${proposal.assistantMessage}\n本周复盘已保存。`,
  };
};
