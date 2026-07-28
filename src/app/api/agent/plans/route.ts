import { type NextRequest, NextResponse } from "next/server";

import { loadPlanSummaries } from "@/lib/core-linkage/api-summaries";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function GET(_request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  const plans = await loadPlanSummaries(payload, authResult.user);

  return NextResponse.json({ plans });
}
