import { NextResponse } from "next/server";

import { handleAgentChatPost } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import { getPayloadAuthResult } from "@/lib/payload/auth";

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能执行 Agent 操作。",
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);

  return handleAgentChatPost({
    body,
    user: authResult.user,
  });
}
