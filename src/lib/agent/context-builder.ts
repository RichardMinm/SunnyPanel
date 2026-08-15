import type { AgentPromptContext } from "./prompts";
import type { AgentIntent, PendingAction } from "./schemas";
import type { AgentWorkbenchMode } from "./workbench-mode";

export type AgentContextMode = "planning" | "content" | "timeline" | "review" | "progress" | "general";

export type AgentContextBudget = {
  maxAgentRuns: number;
  maxContentItems: number;
  maxPlanReviews: number;
  maxPlans: number;
  maxTimelineEvents: number;
};

export type AgentContextRelation =
  | {
      relationTo: "checklists" | "notes" | "pages" | "posts" | "schedule-items" | "timeline-events" | "updates";
      value: number | { id?: number; title?: string };
    };

export type AgentContextPlan = {
  agentBrief?: null | string;
  agentState?: null | string;
  description?: null | string;
  dueDate?: null | string;
  executionMode?: null | string;
  id?: number;
  lastAgentRun?: null | number | { status?: null | string; title?: null | string };
  linkedContent?: AgentContextRelation[] | null;
  priority: string;
  state: string;
  status?: null | string;
  title: string;
  updatedAt?: null | string;
  visibility?: null | string;
};

export type AgentContextChecklistItem = {
  completedAt?: null | string;
  completionNote?: null | string;
  description?: null | string;
  isCompleted?: boolean | null;
  title: string;
};

export type AgentContextChecklist = {
  groups?:
    | {
        items?: AgentContextChecklistItem[] | null;
        title: string;
      }[]
    | null;
  id?: number;
  status?: null | string;
  summary?: null | string;
  title: string;
  updatedAt?: null | string;
  visibility?: null | string;
};

export type AgentContextContentItem = {
  id: number;
  kind: "notes" | "pages" | "posts" | "updates";
  linkedPlanTitles?: string[];
  status: string;
  summary?: null | string;
  title: string;
  updatedAt: string;
  visibility: string;
};

export type AgentContextTimelineEvent = {
  description?: null | string;
  eventDate: string;
  id: number;
  isFeatured?: boolean | null;
  relatedChecklist?: null | number | { id?: number; title?: string };
  relatedPost?: null | number | { id?: number; title?: string };
  relatedTaskKey?: null | string;
  relatedUpdate?: null | number | { id?: number; title?: string };
  status: string;
  title: string;
  type: string;
  updatedAt?: null | string;
  visibility: string;
};

export type AgentContextScheduleItem = {
  date?: null | string;
  endTime?: null | string;
  id: number;
  isAllDay?: boolean | null;
  priority?: null | string;
  relatedChecklist?: null | number | { id?: number; title?: string };
  relatedPlan?: null | number | { id?: number; title?: string };
  sourceType?: null | string;
  startTime?: null | string;
  status?: null | string;
  title: string;
};

export type AgentContextAgentRun = {
  completedAt?: null | string;
  goal?: null | string;
  id: number;
  relatedPlan?: null | number | { id?: number; title?: string };
  startedAt?: null | string;
  status: string;
  summary?: null | string;
  title: string;
  workflow: string;
};

export type AgentContextPlanReview = {
  health: string;
  id: number;
  plan?: null | number | { id?: number; title?: string };
  recommendations?: { content: string }[] | null;
  reviewedAt: string;
  scope: string;
  source: string;
  summary: string;
  title: string;
};

export type AgentContextMemory = {
  confidence: number;
  content: string;
  id: number;
  lastUsedAt?: null | string;
  status: "active" | "archived";
  title: string;
  type: "fact" | "preference" | "project_context" | "workflow_rule" | "writing_style";
  updatedAt?: null | string;
  visibility: "private";
};

export type AgentContextSource = {
  agentRuns?: AgentContextAgentRun[];
  checklists?: AgentContextChecklist[];
  contentItems?: AgentContextContentItem[];
  memories?: AgentContextMemory[];
  now?: string;
  planReviews?: AgentContextPlanReview[];
  plans?: AgentContextPlan[];
  schedules?: AgentContextScheduleItem[];
  timelineCandidates?: AgentContextContentItem[];
  timelineEvents?: AgentContextTimelineEvent[];
};

export const DEFAULT_AGENT_CONTEXT_BUDGET: AgentContextBudget = {
  maxAgentRuns: 6,
  maxContentItems: 12,
  maxPlanReviews: 6,
  maxPlans: 12,
  maxTimelineEvents: 8,
};

const planningKeywords = ["计划", "规划", "plan", "backlog", "active", "paused", "执行", "安排", "任务", "推进"];
const contentKeywords = ["内容", "文章", "帖子", "post", "note", "笔记", "札记", "更新", "update", "页面", "草稿", "发布", "public", "private"];
const timelineKeywords = ["时间线", "timeline", "节点", "里程碑", "milestone", "精选", "featured"];
const reviewKeywords = ["评估", "复盘", "回顾", "review", "审计", "agent run", "运行", "风险", "缺口", "gap"];
const progressKeywords = ["进度", "完成", "done", "清单", "checklist", "百分比"];

const priorityWeight: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const stateWeightByMode: Record<AgentContextMode, Record<string, number>> = {
  content: {
    active: 0,
    backlog: 1,
    paused: 2,
    done: 3,
  },
  general: {
    active: 0,
    backlog: 1,
    paused: 2,
    done: 3,
  },
  planning: {
    active: 0,
    backlog: 1,
    paused: 2,
    done: 3,
  },
  progress: {
    active: 0,
    paused: 1,
    backlog: 2,
    done: 3,
  },
  review: {
    active: 0,
    paused: 1,
    backlog: 2,
    done: 3,
  },
  timeline: {
    active: 0,
    backlog: 1,
    paused: 2,
    done: 3,
  },
};

const includesAny = (value: string, keywords: string[]) =>
  keywords.some((keyword) => value.includes(keyword));

const normalizeForRelevance = (value: string) =>
  value.toLowerCase().replace(/[\s\-_/·，。！？、:：；;（）()]/g, "");

const scoreTextRelevance = (candidate: string, query: string): number => {
  if (!candidate || !query) {
    return 0;
  }

  const normalizedCandidate = normalizeForRelevance(candidate);
  const normalizedQuery = normalizeForRelevance(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return 70;
  }

  const queryTokens = query
    .toLowerCase()
    .split(/[\s,，.。;；:：!?！？/\\_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  let score = queryTokens.reduce(
    (s, token) => s + (candidate.toLowerCase().includes(token) ? 12 : 0),
    0,
  );

  const bigramScore = Array.from(
    { length: Math.max(0, normalizedQuery.length - 1) },
    (_, i) => normalizedQuery.slice(i, i + 2),
  ).reduce((s, bigram) => s + (normalizedCandidate.includes(bigram) ? 3 : 0), 0);

  score += bigramScore;

  return score;
};

const timestampOf = (value: null | string | undefined) => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const relationId = (value: null | number | { id?: number } | undefined) =>
  typeof value === "number" ? value : typeof value?.id === "number" ? value.id : null;

const linkedContentCount = (plan: AgentContextPlan) => plan.linkedContent?.length ?? 0;

const relationTitle = (value: null | number | { title?: string } | undefined) =>
  typeof value === "object" && value && typeof value.title === "string" ? value.title : null;

const checklistCompletion = (checklist: AgentContextChecklist) => {
  const items = (checklist.groups ?? []).flatMap((group) => group.items ?? []);
  const completed = items.filter((item) => item.isCompleted === true).length;

  return {
    completed,
    total: items.length,
  };
};

const sortPlansForMode = (mode: AgentContextMode) => (left: AgentContextPlan, right: AgentContextPlan) => {
  const stateWeights = stateWeightByMode[mode];
  const stateDelta = (stateWeights[left.state] ?? 9) - (stateWeights[right.state] ?? 9);

  if (stateDelta !== 0) {
    return stateDelta;
  }

  const priorityDelta = (priorityWeight[left.priority] ?? 9) - (priorityWeight[right.priority] ?? 9);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return timestampOf(right.updatedAt) - timestampOf(left.updatedAt);
};

const sortContentItems = (left: AgentContextContentItem, right: AgentContextContentItem) =>
  timestampOf(right.updatedAt) - timestampOf(left.updatedAt);

const sortTimelineEvents = (left: AgentContextTimelineEvent, right: AgentContextTimelineEvent) => {
  const featuredDelta = Number(right.isFeatured === true) - Number(left.isFeatured === true);

  if (featuredDelta !== 0) {
    return featuredDelta;
  }

  return timestampOf(right.eventDate) - timestampOf(left.eventDate);
};

const sortAgentRuns = (left: AgentContextAgentRun, right: AgentContextAgentRun) =>
  timestampOf(right.startedAt) - timestampOf(left.startedAt);

const sortPlanReviews = (left: AgentContextPlanReview, right: AgentContextPlanReview) =>
  timestampOf(right.reviewedAt) - timestampOf(left.reviewedAt);

const sortMemories = (left: AgentContextMemory, right: AgentContextMemory) =>
  right.confidence - left.confidence || timestampOf(right.lastUsedAt ?? right.updatedAt) - timestampOf(left.lastUsedAt ?? left.updatedAt);

const shouldKeepPlanForMode = (plan: AgentContextPlan, mode: AgentContextMode) => {
  if (mode === "planning") {
    return plan.state === "active" || plan.state === "backlog" || plan.state === "paused";
  }

  if (mode === "content") {
    return linkedContentCount(plan) > 0 || plan.state === "active" || plan.state === "backlog";
  }

  if (mode === "timeline") {
    return plan.state !== "done" || linkedContentCount(plan) > 0;
  }

  return true;
};

const selectPlans = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget, message?: string) => {
  const filtered = [...(source.plans ?? [])].filter((plan) => shouldKeepPlanForMode(plan, mode));

  if (message) {
    const scored = filtered.map((plan) => ({
      plan,
      relevance: scoreTextRelevance(`${plan.title} ${plan.description ?? ""}`, message),
    }));
    scored.sort((a, b) => b.relevance - a.relevance || sortPlansForMode(mode)(a.plan, b.plan));

    return scored.map((item) => item.plan).slice(0, budget.maxPlans);
  }

  return filtered.sort(sortPlansForMode(mode)).slice(0, budget.maxPlans);
};

const selectChecklists = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget, message?: string) => {
  const limit = Math.max(4, Math.min(12, budget.maxContentItems));
  const checklists = [...(source.checklists ?? [])];

  if (message) {
    const scored = checklists.map((checklist) => ({
      checklist,
      relevance: scoreTextRelevance(
        `${checklist.title} ${checklist.summary ?? ""} ${(checklist.groups ?? []).map((g) => g.title).join(" ")}`,
        message,
      ),
    }));
    scored.sort((a, b) => b.relevance - a.relevance || timestampOf(b.checklist.updatedAt) - timestampOf(a.checklist.updatedAt));

    return scored.map((item) => item.checklist).slice(0, limit);
  }

  if (mode === "progress" || mode === "review") {
    return checklists
      .sort((left, right) => {
        const leftCompletion = checklistCompletion(left);
        const rightCompletion = checklistCompletion(right);

        return rightCompletion.total - leftCompletion.total || timestampOf(right.updatedAt) - timestampOf(left.updatedAt);
      })
      .slice(0, limit);
  }

  return checklists
    .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))
    .slice(0, limit);
};

const selectContentItems = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget, message?: string) => {
  const contentItems = [...(source.contentItems ?? [])];

  if (message) {
    const scored = contentItems.map((item) => ({
      item,
      relevance: scoreTextRelevance(`${item.title} ${item.summary ?? ""}`, message),
    }));
    scored.sort((a, b) => b.relevance - a.relevance || sortContentItems(a.item, b.item));

    return scored.map((s) => s.item).slice(0, budget.maxContentItems);
  }

  if (mode === "content") {
    return contentItems
      .sort((left, right) => {
        const leftRank = left.status === "draft" ? 0 : left.visibility === "private" ? 1 : 2;
        const rightRank = right.status === "draft" ? 0 : right.visibility === "private" ? 1 : 2;

        return leftRank - rightRank || sortContentItems(left, right);
      })
      .slice(0, budget.maxContentItems);
  }

  if (mode === "timeline") {
    return deriveTimelineCandidates(source).slice(0, budget.maxContentItems);
  }

  if (mode === "review") {
    return contentItems
      .filter((item) => item.status === "draft" || item.visibility === "private")
      .sort(sortContentItems)
      .slice(0, Math.ceil(budget.maxContentItems / 2));
  }

  return contentItems.sort(sortContentItems).slice(0, Math.ceil(budget.maxContentItems / 2));
};

const selectTimelineEvents = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget) => {
  if (mode !== "timeline" && mode !== "review" && mode !== "progress" && mode !== "general") {
    return [];
  }

  return [...(source.timelineEvents ?? [])].sort(sortTimelineEvents).slice(0, budget.maxTimelineEvents);
};

const selectAgentRuns = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget) => {
  if (mode !== "review") {
    return [];
  }

  return [...(source.agentRuns ?? [])].sort(sortAgentRuns).slice(0, budget.maxAgentRuns);
};

const selectPlanReviews = (source: AgentContextSource, mode: AgentContextMode, budget: AgentContextBudget) => {
  if (mode !== "review" && mode !== "planning") {
    return [];
  }

  return [...(source.planReviews ?? [])].sort(sortPlanReviews).slice(0, budget.maxPlanReviews);
};

const selectMemories = (source: AgentContextSource, budget: AgentContextBudget) =>
  [...(source.memories ?? [])]
    .filter((memory) => memory.status === "active" && memory.visibility === "private")
    .sort(sortMemories)
    .slice(0, Math.min(8, Math.max(4, budget.maxContentItems)));

const deriveTimelineCandidates = (source: AgentContextSource) => {
  if (source.timelineCandidates) {
    return [...source.timelineCandidates].sort(sortContentItems);
  }

  const linkedTimelineContent = new Set(
    (source.timelineEvents ?? []).flatMap((event) => {
      const keys: string[] = [];
      const relatedPostId = relationId(event.relatedPost);
      const relatedUpdateId = relationId(event.relatedUpdate);

      if (relatedPostId) {
        keys.push(`posts:${relatedPostId}`);
      }

      if (relatedUpdateId) {
        keys.push(`updates:${relatedUpdateId}`);
      }

      return keys;
    }),
  );

  return (source.contentItems ?? [])
    .filter((item) => (item.kind === "posts" || item.kind === "updates") && !linkedTimelineContent.has(`${item.kind}:${item.id}`))
    .sort(sortContentItems);
};

const buildNarrativeGaps = ({
  contentItems,
  mode,
  plans,
  timelineCandidates,
}: {
  contentItems: AgentContextContentItem[];
  mode: AgentContextMode;
  plans: AgentContextPlan[];
  timelineCandidates: AgentContextContentItem[];
}) => {
  const gaps: string[] = [];

  for (const plan of plans) {
    if (plan.state !== "done" && linkedContentCount(plan) === 0) {
      gaps.push(`计划「${plan.title}」还没有 linkedContent 输出。`);
    }
  }

  if (mode === "content" || mode === "review") {
    for (const item of contentItems) {
      if (item.status === "draft") {
        gaps.push(`内容「${item.title}」仍是 draft，可能需要整理为可发布版本。`);
      }
    }
  }

  if (mode === "timeline" || mode === "general") {
    for (const item of timelineCandidates) {
      gaps.push(`内容「${item.title}」还没有对应时间线节点。`);
    }
  }

  return [...new Set(gaps)].slice(0, 6);
};

const toPromptPlan = (plan: AgentContextPlan): AgentPromptContext["plans"][number] => ({
  agentBrief: plan.agentBrief ?? null,
  agentState: plan.agentState ?? null,
  dueDate: plan.dueDate ?? null,
  executionMode: plan.executionMode ?? null,
  id: plan.id ?? null,
  lastAgentRunStatus:
    typeof plan.lastAgentRun === "object" && plan.lastAgentRun
      ? plan.lastAgentRun.status ?? null
      : null,
  linkedContentCount: linkedContentCount(plan),
  priority: plan.priority,
  state: plan.state,
  title: plan.title,
  visibility: plan.visibility ?? null,
});

const toPromptChecklist = (checklist: AgentContextChecklist): AgentPromptContext["checklists"][number] => {
  const completion = checklistCompletion(checklist);

  return {
    completedItems: completion.completed,
    groups: (checklist.groups ?? []).slice(0, 4).map((group) => ({
      items: (group.items ?? []).slice(0, 6).map((item) => item.title),
      title: group.title,
    })),
    id: checklist.id ?? null,
    status: checklist.status ?? null,
    title: checklist.title,
    totalItems: completion.total,
    visibility: checklist.visibility ?? null,
  };
};

const toPromptContentItem = (item: AgentContextContentItem): NonNullable<AgentPromptContext["contentItems"]>[number] => ({
  id: item.id,
  kind: item.kind,
  status: item.status,
  summary: item.summary ?? null,
  title: item.title,
  updatedAt: item.updatedAt,
  visibility: item.visibility,
});

const toPromptTimelineEvent = (
  event: AgentContextTimelineEvent,
): NonNullable<AgentPromptContext["timelineEvents"]>[number] => ({
  eventDate: event.eventDate,
  id: event.id,
  isFeatured: event.isFeatured === true,
  relatedContent:
    relationTitle(event.relatedPost) ??
    relationTitle(event.relatedUpdate) ??
    relationTitle(event.relatedChecklist) ??
    null,
  status: event.status,
  title: event.title,
  type: event.type,
  visibility: event.visibility,
});

const toPromptScheduleItem = (
  item: AgentContextScheduleItem,
): NonNullable<AgentPromptContext["schedules"]>[number] => ({
  date: item.date ?? null,
  endTime: item.endTime ?? null,
  id: item.id,
  isAllDay: item.isAllDay ?? null,
  priority: item.priority ?? null,
  relatedChecklist: item.relatedChecklist ?? null,
  relatedPlan: item.relatedPlan ?? null,
  sourceType: item.sourceType ?? null,
  startTime: item.startTime ?? null,
  status: item.status ?? null,
  title: item.title,
});

const toPromptAgentRun = (run: AgentContextAgentRun): NonNullable<AgentPromptContext["agentRuns"]>[number] => ({
  completedAt: run.completedAt ?? null,
  id: run.id,
  relatedPlanTitle: relationTitle(run.relatedPlan),
  startedAt: run.startedAt ?? null,
  status: run.status,
  summary: run.summary ?? run.goal ?? null,
  title: run.title,
  workflow: run.workflow,
});

const toPromptPlanReview = (
  review: AgentContextPlanReview,
): NonNullable<AgentPromptContext["planReviews"]>[number] => ({
  health: review.health,
  id: review.id,
  planTitle: relationTitle(review.plan),
  recommendations: (review.recommendations ?? []).slice(0, 3).map((item) => item.content),
  reviewedAt: review.reviewedAt,
  scope: review.scope,
  source: review.source,
  summary: review.summary,
  title: review.title,
});

const toPromptMemory = (memory: AgentContextMemory): NonNullable<AgentPromptContext["memories"]>[number] => ({
  confidence: memory.confidence,
  content: memory.content,
  id: memory.id,
  lastUsedAt: memory.lastUsedAt ?? null,
  title: memory.title,
  type: memory.type,
});

export const resolveAgentContextMode = ({
  intent,
  message,
}: {
  intent?: AgentIntent | null;
  message?: string;
}): AgentContextMode => {
  switch (intent?.intent) {
    case "create_plan":
    case "compose_plan":
    case "compose_schedule_item":
    case "append_plan_item":
      return "planning";
    case "complete_plan_item":
    case "query_progress":
      return "progress";
    case "add_completion_note":
    case "compose_timeline_event":
      return "timeline";
    case "evaluate_plan":
    case "weekly_review":
      return "review";
    default:
      break;
  }

  const normalized = (message ?? "").toLowerCase();

  if (includesAny(normalized, reviewKeywords)) {
    return "review";
  }

  if (includesAny(normalized, timelineKeywords)) {
    return "timeline";
  }

  if (includesAny(normalized, contentKeywords)) {
    return "content";
  }

  if (includesAny(normalized, progressKeywords)) {
    return "progress";
  }

  if (includesAny(normalized, planningKeywords)) {
    return "planning";
  }

  return "general";
};

const applyWorkbenchModeBudget = (
  budget: AgentContextBudget,
  workbenchMode: AgentWorkbenchMode | null,
): AgentContextBudget => {
  switch (workbenchMode) {
    case "timeline":
      return {
        ...budget,
        maxTimelineEvents: Math.min(48, budget.maxTimelineEvents + 8),
      };
    case "plan":
    case "execute":
      return {
        ...budget,
        maxPlanReviews: Math.min(12, budget.maxPlanReviews + 3),
        maxPlans: Math.min(24, budget.maxPlans + 4),
      };
    case "review":
      return {
        ...budget,
        maxAgentRuns: Math.min(12, budget.maxAgentRuns + 4),
        maxPlanReviews: Math.min(12, budget.maxPlanReviews + 4),
      };
    case "today":
      return {
        ...budget,
        maxPlans: Math.min(24, budget.maxPlans + 4),
        maxTimelineEvents: Math.min(16, budget.maxTimelineEvents + 4),
      };
    case "writing":
      return {
        ...budget,
        maxContentItems: Math.min(24, budget.maxContentItems + 8),
      };
    default:
      return budget;
  }
};

const applyIntentBudgetBoost = (
  budget: AgentContextBudget,
  intent: AgentIntent["intent"] | null | undefined,
): AgentContextBudget => {
  switch (intent) {
    case "create_plan":
    case "compose_plan":
      return { ...budget, maxPlans: Math.min(24, budget.maxPlans + 2) };
    case "compose_timeline_event":
      return { ...budget, maxTimelineEvents: Math.min(48, budget.maxTimelineEvents + 4) };
    case "weekly_review":
      return {
        ...budget,
        maxAgentRuns: Math.min(12, budget.maxAgentRuns + 3),
        maxPlanReviews: Math.min(12, budget.maxPlanReviews + 3),
      };
    case "evaluate_plan":
      return { ...budget, maxPlanReviews: Math.min(12, budget.maxPlanReviews + 2) };
    case "query_progress":
      return { ...budget, maxContentItems: Math.min(20, budget.maxContentItems + 4) };
    default:
      return budget;
  }
};

export type ContextPreferencesInput = {
  excluded: string[];
  pinned: string[];
};

export const buildAgentContext = ({
  budget = DEFAULT_AGENT_CONTEXT_BUDGET,
  contextPreferences,
  message,
  pendingAction,
  pinnedScheduleIds,
  resolvedIntent,
  source,
  threadSummary,
  workbenchMode,
}: {
  budget?: AgentContextBudget;
  contextPreferences?: ContextPreferencesInput;
  message: string;
  pendingAction: null | PendingAction;
  pinnedScheduleIds?: readonly number[];
  resolvedIntent?: AgentIntent | null;
  source: AgentContextSource;
  threadSummary?: AgentPromptContext["threadSummary"];
  workbenchMode?: AgentWorkbenchMode | null;
}): AgentPromptContext => {
  const inferredMode = resolveAgentContextMode({
    intent: resolvedIntent,
    message,
  });
  const mode =
    workbenchMode === "plan" || workbenchMode === "execute"
      ? "planning"
      : workbenchMode === "review"
        ? "review"
        : workbenchMode === "timeline"
          ? "timeline"
          : workbenchMode === "today"
            ? "progress"
            : workbenchMode === "writing"
              ? "content"
              : workbenchMode === "ask" || workbenchMode === "answer"
                ? "general"
                : inferredMode;

  const modeBudget = applyWorkbenchModeBudget(budget, workbenchMode ?? null);
  const effectiveBudget = applyIntentBudgetBoost(modeBudget, resolvedIntent?.intent);

  const rawPlans = selectPlans(source, mode, effectiveBudget, message);
  const rawChecklists = selectChecklists(source, mode, effectiveBudget, message);
  const rawMemories = selectMemories(source, effectiveBudget);

  const applyPreferences = <T extends { id?: null | number; title?: string }>(
    items: T[],
    keyPrefix: string,
  ): T[] => {
    if (!contextPreferences) {
      return items;
    }

    const filtered = items.filter((_, i) => !contextPreferences.excluded.includes(`${keyPrefix}:${i}`));
    const pinnedKeys = new Set(contextPreferences.pinned.filter((k) => k.startsWith(`${keyPrefix}:`)));

    if (pinnedKeys.size === 0) {
      return filtered;
    }

    const pinned: T[] = [];
    const rest: T[] = [];

    for (const [i, item] of items.entries()) {
      if (pinnedKeys.has(`${keyPrefix}:${i}`)) {
        pinned.push(item);
      } else if (!contextPreferences.excluded.includes(`${keyPrefix}:${i}`)) {
        rest.push(item);
      }
    }

    return [...pinned, ...rest];
  };

  const applyMemoryPreferences = <T extends { title: string }>(items: T[]): T[] => {
    if (!contextPreferences) {
      return items;
    }

    return items.filter((item) => !contextPreferences.excluded.includes(`memory:${item.title}`));
  };

  const plans = applyPreferences(rawPlans, "plan");
  const checklists = applyPreferences(rawChecklists, "checklist");
  const memories = applyMemoryPreferences(rawMemories);
  const contentItems = selectContentItems(source, mode, effectiveBudget, message);
  const timelineEvents = selectTimelineEvents(source, mode, effectiveBudget);
  const timelineCandidates = deriveTimelineCandidates(source).slice(0, effectiveBudget.maxContentItems);
  const agentRuns = selectAgentRuns(source, mode, effectiveBudget);
  const planReviews = selectPlanReviews(source, mode, effectiveBudget);
  const pinnedScheduleIdSet = new Set(pinnedScheduleIds ?? []);
  const sortedSchedules = [...(source.schedules ?? [])].sort((left, right) => {
    const leftKey = `${left.date ?? ""} ${left.startTime ?? ""}`;
    const rightKey = `${right.date ?? ""} ${right.startTime ?? ""}`;

    return leftKey.localeCompare(rightKey);
  });
  const schedules = [
    ...sortedSchedules.filter((schedule) => pinnedScheduleIdSet.has(schedule.id)),
    ...sortedSchedules.filter((schedule) => !pinnedScheduleIdSet.has(schedule.id)),
  ]
    .slice(0, 20);

  return {
    agentRuns: agentRuns.map(toPromptAgentRun),
    checklists: checklists.map(toPromptChecklist),
    contentItems: contentItems.map(toPromptContentItem),
    contextStats: {
      budget: effectiveBudget,
      included: {
        agentRuns: agentRuns.length,
        checklists: checklists.length,
        contentItems: contentItems.length,
        memories: memories.length,
        planReviews: planReviews.length,
        plans: plans.length,
        schedules: schedules.length,
        timelineCandidates: timelineCandidates.length,
        timelineEvents: timelineEvents.length,
      },
      totalAvailable: {
        agentRuns: source.agentRuns?.length ?? 0,
        checklists: source.checklists?.length ?? 0,
        contentItems: source.contentItems?.length ?? 0,
        memories: source.memories?.length ?? 0,
        planReviews: source.planReviews?.length ?? 0,
        plans: source.plans?.length ?? 0,
        schedules: source.schedules?.length ?? 0,
        timelineEvents: source.timelineEvents?.length ?? 0,
      },
    },
    mode,
    memories: memories.map(toPromptMemory),
    narrativeGaps: buildNarrativeGaps({
      contentItems,
      mode,
      plans,
      timelineCandidates,
    }),
    now: source.now ?? new Date().toISOString(),
    pendingAction,
    planReviews: planReviews.map(toPromptPlanReview),
    plans: plans.map(toPromptPlan),
    schedules: schedules.map(toPromptScheduleItem),
    threadSummary: threadSummary ?? null,
    timelineCandidates: timelineCandidates.map(toPromptContentItem),
    timelineEvents: timelineEvents.map(toPromptTimelineEvent),
    workbenchMode: workbenchMode ?? undefined,
  };
};
