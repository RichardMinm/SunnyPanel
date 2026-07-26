import { NextResponse } from "next/server";

import { handleAgentChatPost } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { checkRateLimit } from "@/lib/shared/rate-limit";

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      { message: "当前会话没有登录，暂时不能执行 Agent 操作。" },
      { status: 401 },
    );
  }

  const rateLimit = checkRateLimit(`chat:${authResult.user.id}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "请求过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);

  return handleAgentChatPost({
    body,
    signal: request.signal,
    user: authResult.user,
  });
}
