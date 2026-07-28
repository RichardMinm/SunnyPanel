import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { buildPlansByIdMap, resolveChecklistPlanId } from "@/components/dashboard/agent/utils";
import { createScheduleStatusHandler, type ScheduleStatusDependencies } from "@/lib/schedule/schedule-status-handler";
import {
  completeScheduleItem,
  createTransactionalScheduleCompletionPayload,
} from "@/lib/schedule/complete-schedule-item";

const scheduleStatusDependencies: ScheduleStatusDependencies = {
  atomicUpdateStatus: async ({ data, payload, user, where }) => (payload as Awaited<ReturnType<typeof getPayloadClient>>).db.updateOne({
    collection: "schedule-items",
    data: { ...data, updatedAt: new Date().toISOString() },
    req: { user: user as never },
    where,
  }),
  completeScheduleItem: (input) => completeScheduleItem({
    ...input,
    payload: input.payload as Parameters<typeof completeScheduleItem>[0]["payload"],
  }),
  createTransactionalScheduleCompletionPayload: ({ payload }) => createTransactionalScheduleCompletionPayload({
    payload: payload as Parameters<typeof createTransactionalScheduleCompletionPayload>[0]["payload"],
  }),
  getPayloadAuthResult,
  getPayloadClient,
  readCurrentScheduleStatus: async ({ itemId, payload, user }) => {
    try {
      const item = await (payload as Awaited<ReturnType<typeof getPayloadClient>>).db.findOne({
        collection: "schedule-items",
        req: { user: user as never },
        where: { id: { equals: itemId } },
      });
      return { item, ok: true };
    } catch {
      return { ok: false };
    }
  },
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { message: "需要 month 参数，格式 YYYY-MM" },
      { status: 400 },
    );
  }

  const [year, m] = monthParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, m - 1, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);

  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "schedule-items",
    depth: 1,
    limit: 200,
    overrideAccess: true,
    sort: "date",
    where: {
      and: [
        { date: { greater_than_equal: monthStart } },
        { date: { less_than_equal: monthEnd } },
      ],
    },
  });

  /* Collect unique plan and checklist IDs for batch resolution */
  const planIds = new Set<number>();
  const checklistIds = new Set<number>();
  for (const doc of result.docs) {
    const resolvedPlan = resolveChecklistPlanId((doc as unknown as { relatedPlan?: unknown }).relatedPlan);
    if (resolvedPlan !== null) planIds.add(resolvedPlan);
    const rawChecklist = (doc as unknown as { relatedChecklist?: unknown }).relatedChecklist;
    const resolvedChecklist = resolveChecklistPlanId(rawChecklist);
    if (resolvedChecklist !== null) checklistIds.add(resolvedChecklist);
  }

  /* Batch query plans */
  let plansById = new Map<number, { id: number; title: string }>();
  if (planIds.size > 0) {
    const planResults = await payload.find({
      collection: "plans",
      depth: 0,
      limit: planIds.size,
      overrideAccess: true,
      pagination: false,
      where: { id: { in: Array.from(planIds) } },
    });
    plansById = buildPlansByIdMap(
      planResults.docs.map((p) => ({ id: p.id, title: (p as { title?: string }).title })),
    );
  }

  /* Batch query checklists */
  let checklistsById = new Map<number, { id: number; title: string }>();
  if (checklistIds.size > 0) {
    const checklistResults = await payload.find({
      collection: "checklists",
      depth: 0,
      limit: checklistIds.size,
      overrideAccess: true,
      pagination: false,
      where: { id: { in: Array.from(checklistIds) } },
    });
    checklistsById = buildPlansByIdMap(
      checklistResults.docs.map((c) => ({ id: c.id, title: (c as { title?: string }).title })),
    );
  }

  const normalizeDate = (value: unknown) => {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "string") {
      // Payload may return ISO 8601 strings like "2026-06-08T00:00:00.000Z"
      // — strip the time portion so the calendar lookup key matches.
      return value.slice(0, 10);
    }
    return String(value ?? "");
  };

  const items = result.docs.map((doc) => {
    const rawPlanId = (doc as unknown as { relatedPlan?: unknown }).relatedPlan;
    const resolvedPlanId = resolveChecklistPlanId(rawPlanId);
    const rawChecklistId = (doc as unknown as { relatedChecklist?: unknown }).relatedChecklist;
    const resolvedChecklistId = resolveChecklistPlanId(rawChecklistId);

    return {
      id: doc.id,
      title: doc.title,
      date: normalizeDate(doc.date),
      startTime: doc.startTime ?? null,
      endTime: doc.endTime ?? null,
      status: doc.status,
      priority: doc.priority ?? "medium",
      sourceType: doc.sourceType ?? "manual",
      category: doc.category ?? null,
      planId: resolvedPlanId,
      relatedPlan: resolvedPlanId !== null ? (plansById.get(resolvedPlanId) ?? null) : null,
      relatedChecklist: resolvedChecklistId !== null ? (checklistsById.get(resolvedChecklistId) ?? null) : null,
      relatedChecklistItemKey: (doc as unknown as { relatedChecklistItemKey?: string | null }).relatedChecklistItemKey ?? null,
      conflictNote: (doc as unknown as { conflictNote?: string | null }).conflictNote ?? null,
      description: doc.description ?? null,
    };
  });

  return NextResponse.json({ month: monthParam, items, count: items.length });
}

export async function PUT(request: Request) {
  return createScheduleStatusHandler(scheduleStatusDependencies)(request);
}
