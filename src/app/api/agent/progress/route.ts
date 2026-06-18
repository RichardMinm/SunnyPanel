import { NextResponse } from "next/server";

import {
  parseQueryProgressArgs,
  parseQueryProgressArgsFromSearchParams,
} from "@/lib/agent/api/parse-evaluate-progress-args";
import { formatProgressAssistantMessage, getAgentProgressSnapshot } from "@/lib/agent/progress";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const requireAgentAuth = async () => {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        message: "当前会话没有登录，暂时不能查询 Agent 进度。",
      },
      { status: 401 },
    );
  }

  return null;
};

export async function GET(request: Request) {
  const authError = await requireAgentAuth();

  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  const args = parseQueryProgressArgsFromSearchParams(url.searchParams);
  const snapshot = await getAgentProgressSnapshot(args);

  return NextResponse.json({
    assistantMessage: formatProgressAssistantMessage(snapshot, args),
    snapshot,
  });
}

export async function POST(request: Request) {
  const authError = await requireAgentAuth();

  if (authError) {
    return authError;
  }

  const body = await request.json().catch(() => null);
  const args = parseQueryProgressArgs(body);
  const snapshot = await getAgentProgressSnapshot(args);

  return NextResponse.json({
    assistantMessage: formatProgressAssistantMessage(snapshot, args),
    snapshot,
  });
}
