import "server-only";

import type { ScheduleItemRecord } from "@/lib/schedule/items";
import type { TimelineEvent, Plan, Checklist } from "@/payload-types";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";
import { getPayloadClient } from "@/lib/payload/client";

export type WorkbenchData = {
  todaySchedule: ScheduleItemRecord[];
  planCounts: {
    active: number;
    backlog: number;
    done: number;
    overdue: number;
    paused: number;
    total: number;
  };
  checklistStats: {
    todayCompleted: number;
    weekCompleted: number;
    weekTotal: number;
    remainingTotal: number;
  };
  recentTimeline: TimelineEvent[];
  userName: string;
};

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function loadChecklistStats(): Promise<WorkbenchData["checklistStats"]> {
  const payload = await getPayloadClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = getWeekStart();

  const result = await payload.find({
    collection: "checklists",
    depth: 0,
    limit: 50,
    overrideAccess: true,
    pagination: false,
  });

  const checklists = result.docs as Checklist[];
  let todayCompleted = 0;
  let weekCompleted = 0;
  let weekTotal = 0;
  let remainingTotal = 0;

  for (const checklist of checklists) {
    for (const group of checklist.groups ?? []) {
      for (const item of group.items ?? []) {
        weekTotal++;
        if (item.isCompleted) {
          if (item.completedAt) {
            const completedDate = new Date(item.completedAt);
            if (completedDate >= today && completedDate < tomorrow) {
              todayCompleted++;
            }
            if (completedDate >= weekStart) {
              weekCompleted++;
            }
          }
        } else {
          remainingTotal++;
        }
      }
    }
  }

  return { todayCompleted, weekCompleted, weekTotal, remainingTotal };
}

export async function loadWorkbenchData(): Promise<WorkbenchData> {
  const snapshot = await getCachedWorkspaceSnapshot();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const activePlans = snapshot.plans.active ?? [];
  const backlogPlans = snapshot.plans.backlog ?? [];
  const donePlans = snapshot.plans.done ?? [];
  const pausedPlans = snapshot.plans.paused ?? [];

  const overduePlans = [...activePlans, ...backlogPlans].filter((plan: Plan) => {
    if (!plan.dueDate) return false;
    return plan.dueDate < todayStr && plan.state !== "done";
  });

  const checklistStats = await loadChecklistStats();

  return {
    todaySchedule: snapshot.schedule.today ?? [],
    planCounts: {
      active: activePlans.length,
      backlog: backlogPlans.length,
      done: donePlans.length,
      overdue: overduePlans.length,
      paused: pausedPlans.length,
      total: snapshot.counts.plans ?? 0,
    },
    checklistStats,
    recentTimeline: (snapshot.recentTimelineEvents ?? []).slice(0, 5) as TimelineEvent[],
    userName: snapshot.user?.displayName || snapshot.user?.email || "用户",
  };
}
