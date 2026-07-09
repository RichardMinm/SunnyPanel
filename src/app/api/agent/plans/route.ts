import { type NextRequest, NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

/** Minimal plan summary: persisted fields only, no LLM estimation. */
export type PlanSummary = {
  id: number;
  title: string;
  status?: string | null;
  state?: string | null;
  agentState?: string | null;
  progress?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  checklists: Array<{
    id: number;
    title: string;
    completedItems: number;
    totalItems: number;
  }>;
  scheduleItems: Array<{
    id: number;
    title: string;
    startsAt?: string | null;
    endsAt?: string | null;
    status?: string | null;
  }>;
};

function flattenChecklistItems(groups: unknown): number {
  const items: unknown[] = [];
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group && typeof group === "object" && Array.isArray((group as { items?: unknown }).items)) {
        items.push(...(group as { items: unknown[] }).items);
      }
    }
  }
  return items.length;
}

function countCompletedChecklistItems(groups: unknown): number {
  let completed = 0;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group && typeof group === "object" && Array.isArray((group as { items?: unknown }).items)) {
        for (const item of (group as { items: unknown[] }).items) {
          if (item && typeof item === "object" && (item as { isCompleted?: boolean }).isCompleted) {
            completed++;
          }
        }
      }
    }
  }
  return completed;
}

export async function GET(_request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const payload = await getPayloadClient();

  /* Fetch recent plans */
  const planResult = await payload.find({
    collection: "plans",
    depth: 0,
    limit: 10,
    overrideAccess: true,
    sort: "-updatedAt",
  });

  const plans = planResult.docs as unknown as Array<Record<string, unknown>>;

  /* Collect unique plan IDs for checklist + schedule lookup */
  const planIdSet = new Set(plans.map((p) => p.id as number));

  /* Batch query checklists linked to these plans */
  const checklistsByPlanId = new Map<number, Array<{ completedItems: number; id: number; title: string; totalItems: number }>>();
  if (planIdSet.size > 0) {
    const checklistResult = await payload.find({
      collection: "checklists",
      depth: 0,
      limit: 200,
      overrideAccess: true,
      pagination: false,
      where: { planId: { in: Array.from(planIdSet) } },
    });
    for (const cl of checklistResult.docs) {
      const clDoc = cl as unknown as Record<string, unknown>;
      const planId = clDoc.planId as number;
      const groups = clDoc.groups;
      const total = flattenChecklistItems(groups);
      const completed = countCompletedChecklistItems(groups);
      const entry = {
        id: cl.id,
        title: (clDoc.title as string) ?? "",
        completedItems: completed,
        totalItems: total,
      };
      const list = checklistsByPlanId.get(planId) ?? [];
      list.push(entry);
      checklistsByPlanId.set(planId, list);
    }
  }

  /* Batch query schedule items linked to these plans */
  const scheduleByPlanId = new Map<number, Array<{ endsAt: string | null; id: number; startsAt: string | null; status: string | null; title: string }>>();
  if (planIdSet.size > 0) {
    const scheduleResult = await payload.find({
      collection: "schedule-items",
      depth: 0,
      limit: 200,
      overrideAccess: true,
      pagination: false,
      where: { relatedPlan: { in: Array.from(planIdSet) } },
    });
    for (const si of scheduleResult.docs) {
      const siDoc = si as unknown as Record<string, unknown>;
      const relatedPlan = siDoc.relatedPlan as number | { id: number } | null | undefined;
      const rpId = typeof relatedPlan === "number" ? relatedPlan : relatedPlan?.id;
      if (typeof rpId !== "number") continue;
      const entry = {
        id: si.id,
        title: (siDoc.title as string) ?? "",
        startsAt: typeof siDoc.startTime === "string" ? siDoc.startTime : null,
        endsAt: typeof siDoc.endTime === "string" ? siDoc.endTime : null,
        status: typeof siDoc.status === "string" ? siDoc.status : null,
      };
      const list = scheduleByPlanId.get(rpId) ?? [];
      list.push(entry);
      scheduleByPlanId.set(rpId, list);
    }
  }

  /* Build summaries */
  const summaries: PlanSummary[] = plans.map((p) => ({
    id: p.id as number,
    title: (p.title as string) ?? "",
    status: (p.status as string | null) ?? null,
    state: (p.state as string | null) ?? null,
    agentState: (p.agentState as string | null) ?? null,
    progress: typeof p.progress === "number" ? p.progress : null,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : null,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : null,
    checklists: checklistsByPlanId.get(p.id as number) ?? [],
    scheduleItems: scheduleByPlanId.get(p.id as number) ?? [],
  }));

  return NextResponse.json({ plans: summaries });
}
