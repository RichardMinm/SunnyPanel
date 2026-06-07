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

  const items = result.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: doc.date,
    startTime: doc.startTime ?? null,
    endTime: doc.endTime ?? null,
    status: doc.status,
    priority: doc.priority ?? "medium",
    sourceType: doc.sourceType ?? "manual",
    planId:
      typeof doc.relatedPlan === "number"
        ? doc.relatedPlan
        : doc.relatedPlan?.id ?? null,
    description: doc.description ?? null,
  }));

  return NextResponse.json({ month: monthParam, items, count: items.length });
}
