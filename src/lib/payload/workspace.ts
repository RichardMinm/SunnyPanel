import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";

import type { Note, Plan, Post, TimelineEvent, Update, User } from "@/payload-types";

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

export type WorkspaceSnapshot = {
  counts: {
    activePlans: number;
    backlogPlans: number;
    completedPlans: number;
    draftPosts: number;
    draftSurfaces: number;
    highPriorityPlans: number;
    plans: number;
    pausedPlans: number;
    publicSurfaces: number;
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

  const [plans, recentPosts, recentNotes, recentUpdates, recentTimelineEvents] = await Promise.all([
    payload.find({
      collection: "plans",
      depth: 0,
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
      collection: "timeline-events",
      overrideAccess: true,
    }),
  ]);

  const publicContentItems =
    publicPosts.totalDocs + publicNotes.totalDocs + publicUpdates.totalDocs + publicTimelineEvents.totalDocs;

  return {
    counts: {
      activePlans: activePlans.totalDocs,
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
      pausedPlans: pausedPlans.totalDocs,
      publicSurfaces:
        publicContentItems + publicPages.totalDocs,
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
    recentPosts: recentPosts.docs,
    recentTimelineEvents: recentTimelineEvents.docs,
    recentUpdates: recentUpdates.docs,
    user: authResult.user as User,
  };
};
