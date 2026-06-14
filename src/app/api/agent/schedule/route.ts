import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

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
    depth: 0,
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

  const items = result.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: normalizeDate(doc.date),
    startTime: doc.startTime ?? null,
    endTime: doc.endTime ?? null,
    status: doc.status,
    priority: doc.priority ?? "medium",
    sourceType: doc.sourceType ?? "manual",
    category: doc.category ?? null,
    planId:
      typeof doc.relatedPlan === "number"
        ? doc.relatedPlan
        : doc.relatedPlan?.id ?? null,
    description: doc.description ?? null,
  }));

  return NextResponse.json({ month: monthParam, items, count: items.length });
}

export async function PUT(request: Request) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = (await request.json()) as { id?: number; status?: string };
  const validStatuses = ["planned", "done", "skipped", "canceled"] as const;
  if (!body.id || !body.status || !validStatuses.includes(body.status as typeof validStatuses[number])) {
    return NextResponse.json({ message: "缺少参数或状态无效" }, { status: 400 });
  }

  const payload = await getPayloadClient();
  await payload.update({
    collection: "schedule-items",
    id: body.id,
    data: { status: body.status as typeof validStatuses[number] },
    overrideAccess: true,
  });

  return NextResponse.json({ success: true });
}
