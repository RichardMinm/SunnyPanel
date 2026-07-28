import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { buildPlansByIdMap, resolveChecklistPlanId } from "@/components/dashboard/agent/utils";
import {
  completeScheduleItem,
  createTransactionalScheduleCompletionPayload,
} from "@/lib/schedule/complete-schedule-item";

const validStatuses = ["planned", "done", "skipped", "canceled"] as const;
type ScheduleStatus = typeof validStatuses[number];

const isScheduleStatus = (value: unknown): value is ScheduleStatus =>
  typeof value === "string" && validStatuses.includes(value as ScheduleStatus);

const isPositiveItemId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const boundedFailure = (status: number) =>
  NextResponse.json({ message: "日程更新失败，请稍后重试" }, { status });

const statusItem = (item: { id: number; status: unknown }) => ({
  id: item.id,
  status: typeof item.status === "string" ? item.status : "planned",
});

const affectedDocument = (document: {
  collection: string;
  documentId: number;
  operation: "create" | "update";
  visibility: "private" | "public" | "unknown";
}) => ({
  collection: document.collection,
  documentId: document.documentId,
  operation: document.operation,
  visibility: document.visibility,
});

type ScheduleStatusDependencies = {
  completeScheduleItem: typeof completeScheduleItem;
  createTransactionalScheduleCompletionPayload: typeof createTransactionalScheduleCompletionPayload;
  getPayloadAuthResult: typeof getPayloadAuthResult;
  getPayloadClient: typeof getPayloadClient;
};

const defaultScheduleStatusDependencies: ScheduleStatusDependencies = {
  completeScheduleItem,
  createTransactionalScheduleCompletionPayload,
  getPayloadAuthResult,
  getPayloadClient,
};

/** Server-authenticated Schedule status mutation boundary. */
export const createScheduleStatusHandler = (
  dependencies: ScheduleStatusDependencies = defaultScheduleStatusDependencies,
) => async (request: Request) => {
  const authResult = await dependencies.getPayloadAuthResult();
  if (!authResult.user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as { id?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ message: "缺少参数或状态无效" }, { status: 400 });
  }

  if (!isPositiveItemId(body.id) || !isScheduleStatus(body.status)) {
    return NextResponse.json({ message: "缺少参数或状态无效" }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof getPayloadClient>>;
  try {
    payload = await dependencies.getPayloadClient();
  } catch {
    return boundedFailure(500);
  }

  if (body.status === "done") {
    const result = await dependencies.completeScheduleItem({
      actor: { isAdministrator: true, userId: authResult.user.id },
      itemId: body.id,
      payload: dependencies.createTransactionalScheduleCompletionPayload({ payload }),
    });

    if (!result.ok) {
      const status = result.code === "invalid_reference" ? 400
        : result.code === "resource_not_found" ? 404
          : result.code === "transaction_unavailable" ? 503
            : 500;
      return boundedFailure(status);
    }

    return NextResponse.json({
      success: true,
      affectedDocuments: result.affectedDocuments.map(affectedDocument),
      item: statusItem(result.schedule),
    });
  }

  try {
    const existing = await payload.findByID({
      collection: "schedule-items",
      depth: 0,
      id: body.id,
      overrideAccess: true,
    });

    if (existing.status === "done") {
      return NextResponse.json({ message: "已完成日程只能通过撤销恢复" }, { status: 409 });
    }

    const updated = await payload.update({
      collection: "schedule-items",
      data: { status: body.status },
      id: body.id,
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      affectedDocuments: [{
        collection: "schedule-items",
        documentId: body.id,
        operation: "update",
        visibility: "private",
      }],
      item: statusItem(updated),
    });
  } catch {
    return boundedFailure(500);
  }
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
  return createScheduleStatusHandler()(request);
}
