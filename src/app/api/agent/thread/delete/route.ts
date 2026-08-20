import { type NextRequest, NextResponse } from "next/server";

import { getRelationId } from "@/lib/agent/run-access";
import { deleteAgentThreadWithCheckpoint } from "@/lib/agent/langgraph/checkpoint-lifecycle";
import { getSunnyAgentPostgresSaver } from "@/lib/agent/langgraph/checkpointer";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function DELETE(request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: { id?: number };
  try {
    body = (await request.json()) as { id?: number };
  } catch {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  if (
    typeof body.id !== "number"
    || !Number.isSafeInteger(body.id)
    || body.id <= 0
  ) {
    return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  }

  const threadId = body.id;

  const payload = await getPayloadClient();

  const thread = await payload
    .findByID({
      collection: "agent-threads",
      depth: 0,
      id: threadId,
      overrideAccess: true,
    })
    .catch(() => null);

  if (!thread || getRelationId(thread.user) !== authResult.user.id) {
    return NextResponse.json(
      { message: "Thread 不存在或无权限" },
      { status: 404 },
    );
  }

  try {
    await deleteAgentThreadWithCheckpoint({
      checkpointer: getSunnyAgentPostgresSaver(),
      deleteBusinessThread: () => payload.delete({
        collection: "agent-threads",
        id: threadId,
        overrideAccess: true,
      }).then(() => undefined),
      threadId,
      userId: authResult.user.id,
    });
  } catch {
    return NextResponse.json(
      { message: "暂时无法安全删除对话，请稍后重试" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
