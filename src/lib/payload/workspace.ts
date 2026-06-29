import { redirect } from "next/navigation";
import type { Payload } from "payload";

import type { AgentRun, Checklist, Note, Page, Plan, PlanReview, Post, TimelineEvent, Update, User } from "@/payload-types";

import type {
  AgentContextBudget,
  AgentContextContentItem,
  AgentContextSource,
} from "@/lib/agent/context-builder";
import { buildAgentRunOwnerWhere } from "@/lib/agent/run-access";
import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { buildOnboardingChecklist, ensureInitialWorkspace, hasInitialWorkspaceSeed } from "@/lib/payload/onboarding";
import { getTodaySchedule, getTomorrowSchedule, type ScheduleItemRecord } from "@/lib/schedule/items";

const defaultDashboardPath = "/dashboard";

const buildAdminRoute = (path: string, redirectPath = defaultDashboardPath) =>
  `${path}?redirect=${encodeURIComponent(redirectPath)}`;

const draftConstraint = {
  status: {
    equals: "draft",
  },
};

const privateConstraint = {
  visibility: {
    equals: "private",
  },
};

/** 工作台与 Agent 上下文共用的近期内容拉取上限 */
export const WORKSPACE_CONTENT_LIMIT = 12;

const WORKSPACE_TIMELINE_LIMIT = 100;

const hasLinkedOutputs = (plan: Plan) => Array.isArray(plan.linkedContent) && plan.linkedContent.length > 0;

const summarizeText = (value: string, fallback: string, maxLength = 56) => {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return fallback;
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const getLinkedContentKey = (item: NonNullable<Plan["linkedContent"]>[number]) => {
  const value = item.value;
  const id = typeof value === "number" ? value : value?.id;

  return typeof id === "number" ? `${item.relationTo}:${id}` : null;
};

const getLinkedContentPlanTitles = (plans: Plan[], kind: AgentContextContentItem["kind"], id: number) =>
  plans
    .filter((plan) =>
      (plan.linkedContent ?? []).some((item) => {
        const value = item.value;
        const relationId = typeof value === "number" ? value : value?.id;

        return item.relationTo === kind && relationId === id;
      }),
    )
    .map((plan) => plan.title);

type WorkspaceContentSummary = {
  href: string;
  id: number;
  kind: "checklists" | "notes" | "pages" | "posts" | "timeline-events" | "updates";
  status: "draft" | "published";
  visibility: "private" | "public";
  title: string;
  updatedAt: string;
};

const createContentSummary = (
  kind: WorkspaceContentSummary["kind"],
  doc: Checklist | Note | Page | Post | TimelineEvent | Update,
): WorkspaceContentSummary => {
  switch (kind) {
    case "checklists":
      return {
        href: `/admin/collections/checklists/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Checklist",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "posts":
      return {
        href: `/admin/collections/posts/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Post",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "pages":
      return {
        href: `/admin/collections/pages/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Page",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "timeline-events":
      return {
        href: `/admin/collections/timeline-events/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Timeline Event",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "updates":
      return {
        href: `/admin/collections/updates/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title:
          "content" in doc && typeof doc.content === "string"
            ? summarizeText(doc.content, "Untitled Update")
            : "Untitled Update",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "notes":
    default:
      return {
        href: `/admin/collections/notes/${doc.id}`,
        id: doc.id,
        kind: "notes",
        status: doc.status,
        title:
          "content" in doc && typeof doc.content === "string"
            ? summarizeText(doc.content, "Untitled Note")
            : "Untitled Note",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
  }
};

const createAgentContextContentItem = (
  kind: AgentContextContentItem["kind"],
  doc: Note | Page | Post | Update,
  plans: Plan[],
): AgentContextContentItem => {
  switch (kind) {
    case "posts":
      return {
        id: doc.id,
        kind,
        linkedPlanTitles: getLinkedContentPlanTitles(plans, kind, doc.id),
        status: doc.status,
        summary: "summary" in doc ? doc.summary : null,
        title: "title" in doc ? doc.title : "Untitled Post",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "pages":
      return {
        id: doc.id,
        kind,
        linkedPlanTitles: getLinkedContentPlanTitles(plans, kind, doc.id),
        status: doc.status,
        summary: null,
        title: "title" in doc ? doc.title : "Untitled Page",
        updatedAt: doc.updatedAt,
        visibility: doc.visibility,
      };
    case "updates":
      {
        const content = "content" in doc && typeof doc.content === "string" ? doc.content : "";

        return {
          id: doc.id,
          kind,
          linkedPlanTitles: getLinkedContentPlanTitles(plans, kind, doc.id),
          status: doc.status,
          summary: content ? summarizeText(content, "Untitled Update") : null,
          title: content ? summarizeText(content, "Untitled Update") : "Untitled Update",
          updatedAt: doc.updatedAt,
          visibility: doc.visibility,
        };
      }
    case "notes":
    default:
      {
        const content = "content" in doc && typeof doc.content === "string" ? doc.content : "";

        return {
          id: doc.id,
          kind: "notes",
          linkedPlanTitles: getLinkedContentPlanTitles(plans, "notes", doc.id),
          status: doc.status,
          summary: content ? summarizeText(content, "Untitled Note") : null,
          title: content ? summarizeText(content, "Untitled Note") : "Untitled Note",
          updatedAt: doc.updatedAt,
          visibility: doc.visibility,
        };
      }
  }
};

export type WorkspaceCoreData = {
  agentRuns: { docs: AgentRun[]; totalDocs: number };
  checklists: { docs: Checklist[] };
  counts: {
    draftNotes: { totalDocs: number };
    draftPosts: { totalDocs: number };
    draftTimelineEvents: { totalDocs: number };
    draftUpdates: { totalDocs: number };
    publicChecklists: { totalDocs: number };
    publicNotes: { totalDocs: number };
    publicPages: { totalDocs: number };
    publicPosts: { totalDocs: number };
    publicTimelineEvents: { totalDocs: number };
    publicUpdates: { totalDocs: number };
  };
  notes: { docs: Note[] };
  pages: { docs: Page[] };
  planReviews: { docs: PlanReview[]; totalDocs: number };
  plans: { docs: Plan[] };
  posts: { docs: Post[] };
  schedule: {
    today: ScheduleItemRecord[];
    tomorrow: ScheduleItemRecord[];
  };
  timelineEvents: { docs: TimelineEvent[] };
  updates: { docs: Update[] };
  user: User;
};

export const buildAgentContextSourceFromCore = (
  core: WorkspaceCoreData,
  budget: AgentContextBudget,
): AgentContextSource => {
  const planDocs = core.plans.docs;
  const contentItems = [
    ...core.posts.docs.map((doc) => createAgentContextContentItem("posts", doc, planDocs)),
    ...core.notes.docs.map((doc) => createAgentContextContentItem("notes", doc, planDocs)),
    ...core.updates.docs.map((doc) => createAgentContextContentItem("updates", doc, planDocs)),
    ...core.pages.docs.map((doc) => createAgentContextContentItem("pages", doc, planDocs)),
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const linkedTimelineContentKeys = new Set(
    core.timelineEvents.docs.flatMap((event) => {
      const keys: string[] = [];

      if (event.relatedPost) {
        keys.push(`posts:${typeof event.relatedPost === "number" ? event.relatedPost : event.relatedPost.id}`);
      }

      if (event.relatedUpdate) {
        keys.push(`updates:${typeof event.relatedUpdate === "number" ? event.relatedUpdate : event.relatedUpdate.id}`);
      }

      return keys;
    }),
  );

  return {
    agentRuns: core.agentRuns.docs,
    checklists: core.checklists.docs,
    contentItems,
    now: new Date().toISOString(),
    planReviews: core.planReviews.docs,
    plans: planDocs,
    timelineCandidates: contentItems
      .filter(
        (item) =>
          (item.kind === "posts" || item.kind === "updates") &&
          !linkedTimelineContentKeys.has(`${item.kind}:${item.id}`),
      )
      .slice(0, budget.maxContentItems),
    timelineEvents: core.timelineEvents.docs.slice(0, Math.max(24, budget.maxTimelineEvents * 3)),
  };
};

export const getAgentWorkspaceContextSource = async ({
  budget,
  sections,
  dateRange,
  targetDocument,
}: {
  budget: AgentContextBudget;
  /** Sections to load (default: all = backward compat). null means full load via loadWorkspaceCore. */
  sections?: Set<import("@/lib/agent/context-loading-policy").SectionName> | null;
  dateRange?: import("@/lib/agent/context-loading-policy").ScheduleDateRange;
  targetDocument?: { entityType: string; entityId: number | string };
  payload?: Payload;
}): Promise<AgentContextSource> => {
  /* Backward compat: no sections policy → full load */
  if (!sections || sections.size === 0) {
    const core = await loadWorkspaceCore({ seedInitialWorkspace: false });
    return buildAgentContextSourceFromCore(core, budget);
  }

  const core = await loadAgentWorkspaceSections({
    sections,
    dateRange,
    targetDocument,
  });

  /* Log section status for observability */
  const loadedList = Object.entries(core._sectionStatus)
    .filter(([, status]) => status === "loaded")
    .map(([name]) => name);
  const skippedList = Object.entries(core._sectionStatus)
    .filter(([, status]) => status === "skipped")
    .map(([name]) => name);

  if (loadedList.length > 0 || skippedList.length > 0) {
    // Sections info is threaded through core._sectionStatus;
    // downstream context-loading meta picks this up
  }

  return buildAgentContextSourceFromCore(core, budget);
};

/* ──── Section-aware workspace data ──── */

export type WorkspaceCoreDataWithSections = WorkspaceCoreData & {
  _sectionStatus: Record<string, import("@/lib/agent/context-loading-policy").SectionLoadStatus>;
};

/* ──── Selective workspace loading for Agent pipeline ──── */

type LoadSectionsOptions = {
  sections: Set<import("@/lib/agent/context-loading-policy").SectionName>;
  dateRange?: import("@/lib/agent/context-loading-policy").ScheduleDateRange;
  /** For writing_revision: load the specific document being edited */
  targetDocument?: { entityType: string; entityId: number | string };
};

/**
 * Load workspace data selectively based on requested sections.
 *
 * Each section independently decides to load or skip.
 * Skipped sections are marked with _sectionStatus["sectionName"] = "skipped"
 * and their data fields contain empty defaults — NOT real data.
 *
 * This is the core of the Context Loading Policy v2.
 */
const loadAgentWorkspaceSections = async (
  options: LoadSectionsOptions,
): Promise<WorkspaceCoreDataWithSections> => {
  const { sections, dateRange, targetDocument } = options;
  const payload = await getPayloadClient();
  const authResult = await getPayloadAuthResult();
  const user = authResult.user as User;
  const contentLimit = WORKSPACE_CONTENT_LIMIT;

  const has = (name: string): boolean => sections.has(name as never);

  const [
    plans,
    agentRuns,
    todaySchedule,
    tomorrowSchedule,
    posts,
    notes,
    updates,
    pages,
    timelineEvents,
    checklists,
    planReviews,
    draftPosts,
    draftNotes,
    draftUpdates,
    draftTimelineEvents,
    publicPosts,
    publicNotes,
    publicUpdates,
    publicTimelineEvents,
    publicPages,
    publicChecklists,
  ] = await Promise.all([
    /* plans section */
    has("plans")
      ? payload.find({ collection: "plans", depth: 1, limit: 100, overrideAccess: true, sort: "dueDate", where: privateConstraint })
      : Promise.resolve({ docs: [] as Plan[], _skipped: true as const }),
    /* agentRuns section */
    has("agentRuns")
      ? payload.find({ collection: "agent-runs", depth: 1, limit: 6, overrideAccess: true, sort: "-startedAt", where: buildAgentRunOwnerWhere(user.id) })
      : Promise.resolve({ docs: [] as AgentRun[], totalDocs: 0, _skipped: true as const }),
    /* schedules section — uses dateRange if provided, otherwise today+tomorrow */
    has("schedules") && dateRange
      ? (async () => {
          const { getScheduleForRange } = await import("@/lib/schedule/items");
          return getScheduleForRange(dateRange, payload);
        })()
      : has("schedules") && !dateRange
        ? getTodaySchedule(payload)
        : Promise.resolve([] as ScheduleItemRecord[]),
    has("schedules") && !dateRange
      ? getTomorrowSchedule(payload)
      : Promise.resolve([] as ScheduleItemRecord[]),
    /* content section */
    has("content") && targetDocument
      /* writing_revision: load only the specific document */
      ? (async () => {
          const coll = targetDocument.entityType === "writing" ? "posts" : targetDocument.entityType;
          try {
            const doc = await (payload as unknown as {
              findByID: (args: { collection: string; id: number | string; overrideAccess: boolean; depth: number }) => Promise<unknown>;
            }).findByID({ collection: coll, id: targetDocument.entityId, overrideAccess: true, depth: 0 });
            return { docs: (doc ? [doc] : []) as Post[] };
          } catch {
            return { docs: [] as Post[] };
          }
        })()
      : has("content")
        /* writing_creation or general content: load recent titles */
        ? payload.find({ collection: "posts", depth: 0, limit: contentLimit, overrideAccess: true, sort: "-updatedAt" })
        : Promise.resolve({ docs: [] as Post[], _skipped: true as const }),
    has("content") && !targetDocument
      ? payload.find({ collection: "notes", depth: 0, limit: contentLimit, overrideAccess: true, sort: "-updatedAt" })
      : Promise.resolve({ docs: [] as Note[], _skipped: true as const }),
    has("content") && !targetDocument
      ? payload.find({ collection: "updates", depth: 0, limit: contentLimit, overrideAccess: true, sort: "-updatedAt" })
      : Promise.resolve({ docs: [] as Update[], _skipped: true as const }),
    has("content") && !targetDocument
      ? payload.find({ collection: "pages", depth: 0, limit: contentLimit, overrideAccess: true, sort: "-updatedAt" })
      : Promise.resolve({ docs: [] as Page[], _skipped: true as const }),
    /* timeline section */
    has("timeline")
      ? payload.find({ collection: "timeline-events", depth: 0, limit: WORKSPACE_TIMELINE_LIMIT, overrideAccess: true, sort: "-eventDate" })
      : Promise.resolve({ docs: [] as TimelineEvent[], _skipped: true as const }),
    /* checklists section (planning) */
    has("checklists")
      ? payload.find({ collection: "checklists", depth: 0, limit: contentLimit, overrideAccess: true, sort: "-updatedAt" })
      : Promise.resolve({ docs: [] as Checklist[], _skipped: true as const }),
    /* planReviews section (planning) */
    has("checklists") || has("plans")
      ? payload.find({ collection: "plan-reviews", depth: 1, limit: 6, overrideAccess: true, sort: "-reviewedAt" })
      : Promise.resolve({ docs: [] as PlanReview[], totalDocs: 0, _skipped: true as const }),
    /* counts — only needed for full/dashboard */
    sections.size >= 6 /* full preset has 8 sections */
      ? payload.count({ collection: "posts", overrideAccess: true, where: draftConstraint })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "notes", overrideAccess: true, where: draftConstraint })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "updates", overrideAccess: true, where: draftConstraint })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "timeline-events", overrideAccess: true, where: draftConstraint })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "posts", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "notes", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "updates", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "timeline-events", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "pages", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
    sections.size >= 6
      ? payload.count({ collection: "checklists", overrideAccess: true, where: publicContentConstraint() })
      : Promise.resolve({ totalDocs: 0, _skipped: true as const }),
  ]);

  /* Build section status map */
  const _sectionStatus: Record<string, "loaded" | "skipped"> = {};
  for (const name of sections) {
    _sectionStatus[name] = "loaded";
  }

  return {
    agentRuns: {
      docs: (agentRuns as { docs: AgentRun[]; totalDocs: number }).docs as AgentRun[],
      totalDocs: (agentRuns as { docs: AgentRun[]; totalDocs: number }).totalDocs,
    },
    checklists: { docs: (checklists as { docs: Checklist[] }).docs as Checklist[] },
    counts: {
      draftNotes: draftNotes as { totalDocs: number },
      draftPosts: draftPosts as { totalDocs: number },
      draftTimelineEvents: draftTimelineEvents as { totalDocs: number },
      draftUpdates: draftUpdates as { totalDocs: number },
      publicChecklists: publicChecklists as { totalDocs: number },
      publicNotes: publicNotes as { totalDocs: number },
      publicPages: publicPages as { totalDocs: number },
      publicPosts: publicPosts as { totalDocs: number },
      publicTimelineEvents: publicTimelineEvents as { totalDocs: number },
      publicUpdates: publicUpdates as { totalDocs: number },
    },
    notes: { docs: (notes as { docs: Note[] }).docs as Note[] },
    pages: { docs: (pages as { docs: Page[] }).docs as Page[] },
    planReviews: {
      docs: (planReviews as { docs: PlanReview[]; totalDocs: number }).docs as PlanReview[],
      totalDocs: (planReviews as { docs: PlanReview[]; totalDocs: number }).totalDocs,
    },
    plans: { docs: (plans as { docs: Plan[] }).docs as Plan[] },
    posts: { docs: (posts as { docs: Post[] }).docs as Post[] },
    schedule: {
      today: todaySchedule as ScheduleItemRecord[],
      tomorrow: tomorrowSchedule as ScheduleItemRecord[],
    },
    timelineEvents: { docs: (timelineEvents as { docs: TimelineEvent[] }).docs as TimelineEvent[] },
    updates: { docs: (updates as { docs: Update[] }).docs as Update[] },
    user,
    _sectionStatus,
  };
};

export type WorkspaceSnapshot = {
  counts: {
    activePlans: number;
    agentBlockedPlans: number;
    agentReadyPlans: number;
    agentReviewPlans: number;
    agentRunningPlans: number;
    agentRuns: number;
    planReviews: number;
    activePlansWithoutOutputs: number;
    backlogPlans: number;
    completedPlans: number;
    draftPosts: number;
    draftSurfaces: number;
    highPriorityPlans: number;
    plans: number;
    recentTimelineCandidates: number;
    recentContentWithPlans: number;
    recentContentWithoutPlans: number;
    plansWithOutputs: number;
    plansWithoutOutputs: number;
    pausedPlans: number;
    publicSurfaces: number;
  };
  agent: {
    blockedPlans: Plan[];
    readyPlans: Plan[];
    recentReviews: PlanReview[];
    recentRuns: AgentRun[];
    reviewPlans: Plan[];
    runningPlans: Plan[];
  };
  execution: {
    recentDrafts: WorkspaceContentSummary[];
    recentEdited: WorkspaceContentSummary[];
    timelineCandidates: WorkspaceContentSummary[];
    recentPrivateReady: WorkspaceContentSummary[];
    recentPublicContent: WorkspaceContentSummary[];
    recentContentWithPlans: WorkspaceContentSummary[];
    recentContentWithoutPlans: WorkspaceContentSummary[];
    plansWithOutputs: Plan[];
    plansWithoutOutputs: Plan[];
  };
  onboarding: {
    completed: number;
    tasks: {
      description: string;
      done: boolean;
      href: string;
      title: string;
    }[];
    total: number;
  };
  plans: {
    active: Plan[];
    backlog: Plan[];
    done: Plan[];
    paused: Plan[];
  };
  schedule: {
    today: ScheduleItemRecord[];
    tomorrow: ScheduleItemRecord[];
  };
  recentNotes: Note[];
  recentPages: Page[];
  recentPosts: Post[];
  recentTimelineEvents: TimelineEvent[];
  recentUpdates: Update[];
  user: User;
};

export const assembleWorkspaceSnapshot = (core: WorkspaceCoreData): WorkspaceSnapshot => {
  const { counts } = core;
  const plans = { docs: core.plans.docs };
  const recentPosts = { docs: core.posts.docs };
  const recentNotes = { docs: core.notes.docs };
  const recentUpdates = { docs: core.updates.docs };
  const recentPages = { docs: core.pages.docs };
  const recentChecklists = { docs: core.checklists.docs };
  const recentAgentRuns = { docs: core.agentRuns.docs, totalDocs: core.agentRuns.totalDocs };
  const recentPlanReviews = { docs: core.planReviews.docs, totalDocs: core.planReviews.totalDocs };
  const timelineReferences = { docs: core.timelineEvents.docs };
  const recentTimelineEvents = { docs: core.timelineEvents.docs.slice(0, WORKSPACE_CONTENT_LIMIT) };
  const todaySchedule = core.schedule.today;
  const tomorrowSchedule = core.schedule.tomorrow;
  const draftPosts = counts.draftPosts;
  const draftNotes = counts.draftNotes;
  const draftUpdates = counts.draftUpdates;
  const draftTimelineEvents = counts.draftTimelineEvents;
  const publicPosts = counts.publicPosts;
  const publicNotes = counts.publicNotes;
  const publicUpdates = counts.publicUpdates;
  const publicTimelineEvents = counts.publicTimelineEvents;
  const publicPages = counts.publicPages;
  const publicChecklists = counts.publicChecklists;

  const publicContentItems =
    publicPosts.totalDocs + publicNotes.totalDocs + publicUpdates.totalDocs + publicTimelineEvents.totalDocs;
  const readyAgentPlans = plans.docs.filter((plan) => plan.agentState === "ready");
  const runningAgentPlans = plans.docs.filter((plan) => plan.agentState === "running");
  const blockedAgentPlans = plans.docs.filter((plan) => plan.agentState === "blocked");
  const reviewAgentPlans = plans.docs.filter((plan) => plan.agentState === "review");
  const activePlans = plans.docs.filter((plan) => plan.state === "active");
  const backlogPlans = plans.docs.filter((plan) => plan.state === "backlog");
  const pausedPlans = plans.docs.filter((plan) => plan.state === "paused");
  const completedPlans = plans.docs.filter((plan) => plan.state === "done");
  const highPriorityPlans = plans.docs.filter((plan) => plan.priority === "high");
  const plansWithOutputs = plans.docs.filter(hasLinkedOutputs);
  const plansWithoutOutputs = plans.docs.filter((plan) => !hasLinkedOutputs(plan));
  const activePlansWithoutOutputs = activePlans.filter((plan) => !hasLinkedOutputs(plan));
  const linkedContentKeys = new Set(
    plans.docs.flatMap((plan) =>
      (plan.linkedContent ?? []).map((item) => getLinkedContentKey(item)).filter((item): item is string => Boolean(item)),
    ),
  );
  const recentContent = [
    ...recentPosts.docs.map((doc) => createContentSummary("posts", doc)),
    ...recentNotes.docs.map((doc) => createContentSummary("notes", doc)),
    ...recentUpdates.docs.map((doc) => createContentSummary("updates", doc)),
    ...recentTimelineEvents.docs.map((doc) => createContentSummary("timeline-events", doc)),
    ...recentPages.docs.map((doc) => createContentSummary("pages", doc)),
    ...recentChecklists.docs.map((doc) => createContentSummary("checklists", doc)),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const recentContentWithPlans = recentContent
    .filter((item) => linkedContentKeys.has(`${item.kind}:${item.id}`))
    .slice(0, 6);
  const recentContentWithoutPlans = recentContent
    .filter((item) => !linkedContentKeys.has(`${item.kind}:${item.id}`))
    .slice(0, 6);
  const recentDrafts = recentContent.filter((item) => item.status === "draft").slice(0, 6);
  const recentPrivateReady = recentContent
    .filter((item) => item.status === "published" && item.visibility === "private")
    .slice(0, 6);
  const recentPublicContent = recentContent
    .filter((item) => item.status === "published" && item.visibility === "public")
    .slice(0, 6);
  const linkedTimelineContentKeys = new Set(
    timelineReferences.docs.flatMap((event) => {
      const keys: string[] = [];

      if (event.relatedPost) {
        keys.push(`posts:${typeof event.relatedPost === "number" ? event.relatedPost : event.relatedPost.id}`);
      }

      if (event.relatedUpdate) {
        keys.push(`updates:${typeof event.relatedUpdate === "number" ? event.relatedUpdate : event.relatedUpdate.id}`);
      }

      return keys;
    }),
  );
  const timelineCandidates = [
    ...recentPosts.docs.map((doc) => createContentSummary("posts", doc)),
    ...recentUpdates.docs.map((doc) => createContentSummary("updates", doc)),
  ]
    .filter((item) => !linkedTimelineContentKeys.has(`${item.kind}:${item.id}`))
    .slice(0, 6);

  return {
    counts: {
      activePlans: activePlans.length,
      agentBlockedPlans: blockedAgentPlans.length,
      agentReadyPlans: readyAgentPlans.length,
      agentReviewPlans: reviewAgentPlans.length,
      agentRunningPlans: runningAgentPlans.length,
      agentRuns: recentAgentRuns.totalDocs,
      planReviews: recentPlanReviews.totalDocs,
      activePlansWithoutOutputs: activePlansWithoutOutputs.length,
      backlogPlans: backlogPlans.length,
      completedPlans: completedPlans.length,
      draftPosts: draftPosts.totalDocs,
      draftSurfaces:
        draftPosts.totalDocs +
        draftNotes.totalDocs +
        draftUpdates.totalDocs +
        draftTimelineEvents.totalDocs,
      highPriorityPlans: highPriorityPlans.length,
      plans: plans.docs.length,
      recentTimelineCandidates: timelineCandidates.length,
      recentContentWithPlans: recentContentWithPlans.length,
      recentContentWithoutPlans: recentContentWithoutPlans.length,
      plansWithOutputs: plansWithOutputs.length,
      plansWithoutOutputs: plansWithoutOutputs.length,
      pausedPlans: pausedPlans.length,
      publicSurfaces:
        publicContentItems + publicPages.totalDocs + publicChecklists.totalDocs,
    },
    agent: {
      blockedPlans: blockedAgentPlans.slice(0, 6),
      readyPlans: readyAgentPlans.slice(0, 6),
      recentReviews: recentPlanReviews.docs,
      recentRuns: recentAgentRuns.docs,
      reviewPlans: reviewAgentPlans.slice(0, 6),
      runningPlans: runningAgentPlans.slice(0, 6),
    },
    execution: {
      recentDrafts,
      recentEdited: recentContent.slice(0, 8),
      timelineCandidates,
      recentPrivateReady,
      recentPublicContent,
      recentContentWithPlans,
      recentContentWithoutPlans,
      plansWithOutputs: plansWithOutputs.slice(0, 6),
      plansWithoutOutputs: plansWithoutOutputs.slice(0, 6),
    },
    onboarding: buildOnboardingChecklist({
      activePlans: activePlans.length,
      agentRuns: recentAgentRuns.totalDocs,
      agentReadyPlans: readyAgentPlans.length,
      publicContentItems,
      publicPages: publicPages.totalDocs,
      timelineEvents: recentTimelineEvents.docs.length,
    }),
    plans: {
      active: activePlans,
      backlog: backlogPlans,
      done: completedPlans,
      paused: pausedPlans,
    },
    schedule: {
      today: todaySchedule,
      tomorrow: tomorrowSchedule,
    },
    recentNotes: recentNotes.docs,
    recentPages: recentPages.docs,
    recentPosts: recentPosts.docs,
    recentTimelineEvents: recentTimelineEvents.docs,
    recentUpdates: recentUpdates.docs,
    user: core.user,
  };
};

type LoadWorkspaceCoreOptions = {
  redirectPath?: string;
  seedInitialWorkspace?: boolean;
};

export const loadWorkspaceCore = async (
  input: LoadWorkspaceCoreOptions | string = defaultDashboardPath,
): Promise<WorkspaceCoreData> => {
  const redirectPath =
    typeof input === "string"
      ? input
      : input.redirectPath ?? defaultDashboardPath;
  const shouldSeedInitialWorkspace =
    typeof input === "string"
      ? true
      : input.seedInitialWorkspace ?? true;
  const payload = await getPayloadClient();

  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    const existingUsers = await payload.find({
      collection: "users",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
    });

    if (existingUsers.totalDocs === 0) {
      redirect(buildAdminRoute("/admin/create-first-user", redirectPath));
    }

    redirect(buildAdminRoute("/admin/login", redirectPath));
  }

  const hasWorkspaceSeed =
    shouldSeedInitialWorkspace
      ? await hasInitialWorkspaceSeed(payload)
      : true;

  if (shouldSeedInitialWorkspace && !hasWorkspaceSeed) {
    await ensureInitialWorkspace(payload, authResult.user as User);
  }

  const contentLimit = WORKSPACE_CONTENT_LIMIT;

  const [plans, posts, notes, updates, pages, checklists, agentRuns, planReviews, timelineEvents, todaySchedule, tomorrowSchedule, draftPosts, draftNotes, draftUpdates, draftTimelineEvents, publicPosts, publicNotes, publicUpdates, publicTimelineEvents, publicPages, publicChecklists] = await Promise.all([
    payload.find({
      collection: "plans",
      depth: 1,
      limit: 100,
      overrideAccess: true,
      sort: "dueDate",
      where: privateConstraint,
    }),
    payload.find({
      collection: "posts",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "notes",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "updates",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "pages",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "checklists",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "agent-runs",
      depth: 1,
      limit: 6,
      overrideAccess: true,
      sort: "-startedAt",
      where: buildAgentRunOwnerWhere(authResult.user.id),
    }),
    payload.find({
      collection: "plan-reviews",
      depth: 1,
      limit: 6,
      overrideAccess: true,
      sort: "-reviewedAt",
    }),
    payload.find({
      collection: "timeline-events",
      depth: 0,
      limit: WORKSPACE_TIMELINE_LIMIT,
      overrideAccess: true,
      sort: "-eventDate",
    }),
    getTodaySchedule(payload),
    getTomorrowSchedule(payload),
    payload.count({
      collection: "posts",
      overrideAccess: true,
      where: draftConstraint,
    }),
    payload.count({
      collection: "notes",
      overrideAccess: true,
      where: draftConstraint,
    }),
    payload.count({
      collection: "updates",
      overrideAccess: true,
      where: draftConstraint,
    }),
    payload.count({
      collection: "timeline-events",
      overrideAccess: true,
      where: draftConstraint,
    }),
    payload.count({
      collection: "posts",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
    payload.count({
      collection: "notes",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
    payload.count({
      collection: "updates",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
    payload.count({
      collection: "timeline-events",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
    payload.count({
      collection: "pages",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
    payload.count({
      collection: "checklists",
      overrideAccess: true,
      where: publicContentConstraint(),
    }),
  ]);

  return {
    agentRuns: {
      docs: agentRuns.docs as AgentRun[],
      totalDocs: agentRuns.totalDocs,
    },
    checklists: { docs: checklists.docs as Checklist[] },
    counts: {
      draftNotes,
      draftPosts,
      draftTimelineEvents,
      draftUpdates,
      publicChecklists,
      publicNotes,
      publicPages,
      publicPosts,
      publicTimelineEvents,
      publicUpdates,
    },
    notes: { docs: notes.docs as Note[] },
    pages: { docs: pages.docs as Page[] },
    planReviews: {
      docs: planReviews.docs as PlanReview[],
      totalDocs: planReviews.totalDocs,
    },
    plans: { docs: plans.docs as Plan[] },
    posts: { docs: posts.docs as Post[] },
    schedule: {
      today: todaySchedule,
      tomorrow: tomorrowSchedule,
    },
    timelineEvents: { docs: timelineEvents.docs as TimelineEvent[] },
    updates: { docs: updates.docs as Update[] },
    user: authResult.user as User,
  };
};
