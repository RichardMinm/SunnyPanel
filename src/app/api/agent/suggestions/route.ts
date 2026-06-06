import { NextResponse } from "next/server";

import {
  acceptSuggestion,
  dismissSuggestion,
  getPendingAgentSuggestions,
  markSuggestionDone,
} from "@/lib/agent/suggestions";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export async function GET() {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        message: "当前会话没有登录，暂时不能读取 Agent 建议。",
      },
      { status: 401 },
    );
  }

  const suggestions = await getPendingAgentSuggestions(6);

  return NextResponse.json({
    suggestions,
  });
}

export async function PATCH(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        message: "当前会话没有登录，暂时不能更新 Agent 建议。",
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        message: "请求体格式不正确。",
      },
      { status: 400 },
    );
  }

  const id = parseId(body.id);
  const action = typeof body.action === "string" ? body.action : null;

  if (!id || (action !== "accept" && action !== "dismiss" && action !== "done")) {
    return NextResponse.json(
      {
        message: "需要提供有效的 suggestion id 和 action。",
      },
      { status: 400 },
    );
  }

  const suggestion =
    action === "accept"
      ? await acceptSuggestion(id)
      : action === "dismiss"
        ? await dismissSuggestion(id)
        : await markSuggestionDone(id);

  return NextResponse.json({
    suggestion,
  });
}
