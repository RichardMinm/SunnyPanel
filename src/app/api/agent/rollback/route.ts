import { NextResponse } from "next/server";

import { executeTrustedRollbackRequest } from "@/lib/agent/rollback-request";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json({ message: "请求体格式不正确" }, { status: 400 });
  }

  try {
    const sourceRunId = typeof body.sourceRunId === "number" && Number.isFinite(body.sourceRunId)
      ? body.sourceRunId
      : null;
    const payload = await getPayloadClient();
    const rollback = await executeTrustedRollbackRequest({
      payload,
      rollbackPayload: body.rollbackPayload,
      sourceRunId,
      userId: authResult.user.id,
    });

    return NextResponse.json({
      ok: true,
      result: rollback.result,
      sourceRunId: rollback.sourceRunId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "回滚失败",
      },
      { status: 400 },
    );
  }
}
