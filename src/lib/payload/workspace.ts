import { redirect } from "next/navigation";

import type { AgentRun, Checklist, Note, Page, Plan, PlanReview, Post, TimelineEvent, Update, User } from "@/payload-types";

import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { buildOnboardingChecklist, ensureInitialWorkspace, hasInitialWorkspaceSeed } from "@/lib/payload/onboarding";

const dashboardPath = "/dashboard";

const buildAdminRoute = (path: string) => `${path}?redirect=${encodeURIComponent(dashboardPath)}`;

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
  recentNotes: Note[];
  recentPages: Page[];
  recentPosts: Post[];
  recentTimelineEvents: TimelineEvent[];
  recentUpdates: Update[];
  user: User;
};

export const getWorkspaceSnapshot = async (): Promise<WorkspaceSnapshot> => {
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
      redirect(buildAdminRoute("/admin/create-first-user"));
    }

    redirect(buildAdminRoute("/admin/login"));
  }

  const hasWorkspaceSeed = await hasInitialWorkspaceSeed(payload);

  if (!hasWorkspaceSeed) {
    await ensureInitialWorkspace(payload, authResult.user as User);
  }

  const [plans, recentPosts, recentNotes, recentUpdates, recentTimelineEvents, recentPages, recentChecklists, recentAgentRuns, recentPlanReviews, timelineReferences] = await Promise.all([
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
      limit: 4,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "notes",
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "updates",
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "timeline-events",
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: "-eventDate",
    }),
    payload.find({
      collection: "pages",
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "checklists",
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "agent-runs",
      depth: 1,
      limit: 6,
      overrideAccess: true,
      sort: "-startedAt",
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
      limit: 100,
      overrideAccess: true,
      sort: "-eventDate",
    }),
  ]);

  const [draftPosts, draftNotes, draftUpdates, draftTimelineEvents, publicPosts, publicNotes, publicUpdates, publicTimelineEvents, publicPages, publicChecklists] = await Promise.all([
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
      timelineEvents: recentTimelineEvents.totalDocs,
    }),
    plans: {
      active: activePlans,
      backlog: backlogPlans,
      done: completedPlans,
      paused: pausedPlans,
    },
    recentNotes: recentNotes.docs,
    recentPages: recentPages.docs,
    recentPosts: recentPosts.docs,
    recentTimelineEvents: recentTimelineEvents.docs,
    recentUpdates: recentUpdates.docs,
    user: authResult.user as User,
  };
};
