import { NextResponse } from "next/server";

import { executeRollbackFromPayload } from "@/lib/agent/rollback";
import { getPayloadAuthResult } from "@/lib/payload/auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!isRecord(body) || body.rollbackPayload === undefined) {
    return NextResponse.json({ message: "请求体需包含 rollbackPayload" }, { status: 400 });
  }

  try {
    const result = await executeRollbackFromPayload(body.rollbackPayload);

    return NextResponse.json({
      ok: true,
      result,
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
