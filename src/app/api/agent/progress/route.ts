import { NextResponse } from "next/server";

import { formatProgressAssistantMessage, getAgentProgressSnapshot } from "@/lib/agent/progress";
import type { QueryProgressArgs } from "@/lib/agent/schemas";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseScope = (value: unknown): QueryProgressArgs["scope"] => {
  if (value === "all" || value === "checklists" || value === "plans") {
    return value;
  }

  return "all";
};

const parseProgressArgs = (value: unknown): QueryProgressArgs => {
  if (!isRecord(value)) {
    return {
      scope: "all",
    };
  }

  return {
    checklistTitle: typeof value.checklistTitle === "string" ? value.checklistTitle.trim() || null : null,
    scope: parseScope(value.scope),
  };
};

const requireAgentAuth = async () => {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能查询 Agent 进度。",
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
  const args = parseProgressArgs({
    checklistTitle: url.searchParams.get("checklistTitle"),
    scope: url.searchParams.get("scope"),
  });
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
  const args = parseProgressArgs(body);
  const snapshot = await getAgentProgressSnapshot(args);

  return NextResponse.json({
    assistantMessage: formatProgressAssistantMessage(snapshot, args),
    snapshot,
  });
}
