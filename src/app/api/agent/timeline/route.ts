import { type NextRequest, NextResponse } from "next/server";

import { loadTimelineSummaries } from "@/lib/core-linkage/api-summaries";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function GET(request: NextRequest) {
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

  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  const [year, m] = monthParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, m - 1, 1)).toISOString();
  const monthEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)).toISOString();

  const payload = await getPayloadClient();
  const events = await loadTimelineSummaries(payload, authResult.user, { limit, monthEnd, monthStart });

  return NextResponse.json({ events });
}
