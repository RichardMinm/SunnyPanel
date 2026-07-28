import { type NextRequest, NextResponse } from "next/server";

import { loadChecklistSummaries } from "@/lib/core-linkage/api-summaries";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function GET(request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filterStatus = url.searchParams.get("status")?.trim() || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  const payload = await getPayloadClient();
  const checklists = await loadChecklistSummaries(payload, authResult.user, { filterStatus, limit });

  return NextResponse.json({ checklists });
}
