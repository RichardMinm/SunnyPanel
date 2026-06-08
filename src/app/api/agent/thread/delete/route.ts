import { type NextRequest, NextResponse } from "next/server";

import { getRelationId } from "@/lib/agent/run-access";
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

  if (!body.id || typeof body.id !== "number") {
    return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  }

  const payload = await getPayloadClient();

  const thread = await payload
    .findByID({
      collection: "agent-threads",
      depth: 0,
      id: body.id,
      overrideAccess: true,
    })
    .catch(() => null);

  if (!thread || getRelationId(thread.user) !== authResult.user.id) {
    return NextResponse.json(
      { message: "Thread 不存在或无权限" },
      { status: 404 },
    );
  }

  const relatedRuns = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 500,
    overrideAccess: true,
    where: { thread: { equals: body.id } },
  });

  let deletedRuns = 0;
  for (const run of relatedRuns.docs) {
    try {
      await payload.delete({
        collection: "agent-runs",
        id: run.id,
        overrideAccess: true,
      });
      deletedRuns++;
    } catch {
      console.error(
        `Failed to delete agent-run ${run.id} during thread ${body.id} cleanup`,
      );
    }
  }

  await payload.delete({
    collection: "agent-threads",
    id: body.id,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, deletedRuns });
}
