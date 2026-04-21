import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";

import type { Checklist, Note, Page, Plan, Post, TimelineEvent, Update, User } from "@/payload-types";

import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadClient } from "@/lib/payload/client";
import { buildOnboardingChecklist } from "@/lib/payload/onboarding";

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

const highPriorityPlanConstraint = {
  and: [
    {
      priority: {
        equals: "high",
      },
    },
    privateConstraint,
  ],
};

const planStateConstraint = (state: "active" | "backlog" | "done" | "paused") => ({
  and: [
    {
      state: {
        equals: state,
      },
    },
    privateConstraint,
  ],
});

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
      };
    case "posts":
      return {
        href: `/admin/collections/posts/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Post",
        updatedAt: doc.updatedAt,
      };
    case "pages":
      return {
        href: `/admin/collections/pages/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Page",
        updatedAt: doc.updatedAt,
      };
    case "timeline-events":
      return {
        href: `/admin/collections/timeline-events/${doc.id}`,
        id: doc.id,
        kind,
        status: doc.status,
        title: "title" in doc ? doc.title : "Untitled Timeline Event",
        updatedAt: doc.updatedAt,
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
      };
  }
};

export type WorkspaceSnapshot = {
  counts: {
    activePlans: number;
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
  execution: {
    timelineCandidates: WorkspaceContentSummary[];
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

  const authResult = await payload.auth({
    headers: await getHeaders(),
  });

  if (!authResult.user) {
    redirect(buildAdminRoute("/admin/login"));
  }

  const [plans, recentPosts, recentNotes, recentUpdates, recentTimelineEvents, recentPages, recentChecklists, timelineReferences] = await Promise.all([
    payload.find({
      collection: "plans",
      depth: 1,
      limit: 24,
      overrideAccess: true,
      sort: "dueDate",
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
      collection: "timeline-events",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "-eventDate",
    }),
  ]);

  const [
    totalPlans,
    activePlans,
    backlogPlans,
    pausedPlans,
    completedPlans,
    highPriorityPlans,
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
    totalTimelineEvents,
  ] = await Promise.all([
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: privateConstraint,
    }),
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: planStateConstraint("active"),
    }),
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: planStateConstraint("backlog"),
    }),
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: planStateConstraint("paused"),
    }),
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: planStateConstraint("done"),
    }),
    payload.count({
      collection: "plans",
      overrideAccess: true,
      where: highPriorityPlanConstraint,
    }),
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
    payload.count({
      collection: "timeline-events",
      overrideAccess: true,
    }),
  ]);

  const publicContentItems =
    publicPosts.totalDocs + publicNotes.totalDocs + publicUpdates.totalDocs + publicTimelineEvents.totalDocs;
  const plansWithOutputs = plans.docs.filter(hasLinkedOutputs);
  const plansWithoutOutputs = plans.docs.filter((plan) => !hasLinkedOutputs(plan));
  const activePlansWithoutOutputs = plans.docs.filter(
    (plan) => plan.state === "active" && !hasLinkedOutputs(plan),
  );
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
      activePlans: activePlans.totalDocs,
      activePlansWithoutOutputs: activePlansWithoutOutputs.length,
      backlogPlans: backlogPlans.totalDocs,
      completedPlans: completedPlans.totalDocs,
      draftPosts: draftPosts.totalDocs,
      draftSurfaces:
        draftPosts.totalDocs +
        draftNotes.totalDocs +
        draftUpdates.totalDocs +
        draftTimelineEvents.totalDocs,
      highPriorityPlans: highPriorityPlans.totalDocs,
      plans: totalPlans.totalDocs,
      recentTimelineCandidates: timelineCandidates.length,
      recentContentWithPlans: recentContentWithPlans.length,
      recentContentWithoutPlans: recentContentWithoutPlans.length,
      plansWithOutputs: plansWithOutputs.length,
      plansWithoutOutputs: plansWithoutOutputs.length,
      pausedPlans: pausedPlans.totalDocs,
      publicSurfaces:
        publicContentItems + publicPages.totalDocs + publicChecklists.totalDocs,
    },
    execution: {
      timelineCandidates,
      recentContentWithPlans,
      recentContentWithoutPlans,
      plansWithOutputs: plansWithOutputs.slice(0, 6),
      plansWithoutOutputs: plansWithoutOutputs.slice(0, 6),
    },
    onboarding: buildOnboardingChecklist({
      activePlans: activePlans.totalDocs,
      publicContentItems,
      publicPages: publicPages.totalDocs,
      timelineEvents: totalTimelineEvents.totalDocs,
    }),
    plans: {
      active: plans.docs.filter((plan) => plan.state === "active"),
      backlog: plans.docs.filter((plan) => plan.state === "backlog"),
      done: plans.docs.filter((plan) => plan.state === "done"),
      paused: plans.docs.filter((plan) => plan.state === "paused"),
    },
    recentNotes: recentNotes.docs,
    recentPages: recentPages.docs,
    recentPosts: recentPosts.docs,
    recentTimelineEvents: recentTimelineEvents.docs,
    recentUpdates: recentUpdates.docs,
    user: authResult.user as User,
  };
};
