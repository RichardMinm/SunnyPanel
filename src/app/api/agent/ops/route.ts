import { NextResponse } from "next/server";

import {
  buildAgentOpsSnapshot,
  type AgentOpsPayloadClient,
} from "@/lib/agent/ops/snapshot";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const parseLimit = (value: null | string) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 50);
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const payload = await getPayloadClient();
  const snapshot = await buildAgentOpsSnapshot({
    limit,
    payload: payload as unknown as AgentOpsPayloadClient,
    userId: authResult.user.id,
  });

  return NextResponse.json(snapshot);
}
