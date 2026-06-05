import { NextResponse } from "next/server";

import { buildAgentRunOwnerWhere } from "@/lib/agent/run-access";
import { toAgentRunDetail } from "@/lib/agent/run-summary";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const parseRunId = (value: null | string) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const runId = parseRunId(url.searchParams.get("runId"));

  if (runId === null) {
    return NextResponse.json({ message: "缺少 runId" }, { status: 400 });
  }

  const payload = await getPayloadClient();
  const runs = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: buildAgentRunOwnerWhere(authResult.user.id, { id: { equals: runId } }),
  });
  const run = runs.docs[0] ?? null;

  if (!run) {
    return NextResponse.json({ message: "AgentRun 不存在" }, { status: 404 });
  }

  return NextResponse.json({
    run: toAgentRunDetail(run as unknown as Record<string, unknown>),
  });
}
