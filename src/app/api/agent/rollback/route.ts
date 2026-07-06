import { NextResponse } from "next/server";

import { executeTrustedRollbackRequest } from "@/lib/agent/rollback-request";
import {
  appendAgentTraceEvent,
  type AgentTraceEventInput,
  type AgentTraceEventPayload,
} from "@/lib/agent/trace";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { isRecord } from "@/lib/shared/is-record";

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json({ message: "请求体格式不正确" }, { status: 400 });
  }

  const backendTraceEvents: AgentTraceEventPayload[] = [];
  const recordBackendTrace = (event: AgentTraceEventInput) => {
    void appendAgentTraceEvent({
      collector: backendTraceEvents,
      event: {
        createdAt: new Date().toISOString(),
        threadId: typeof body.threadId === "string" || typeof body.threadId === "number"
          ? String(body.threadId)
          : "rollback",
        ...event,
      },
    });
  };

  try {
    const sourceRunId = typeof body.sourceRunId === "number" && Number.isFinite(body.sourceRunId)
      ? body.sourceRunId
      : null;
    const rollbackStartedAt = Date.now();
    recordBackendTrace({
      actionId: sourceRunId ? `run:${sourceRunId}` : undefined,
      inputPreview: {
        hasClientRollbackPayload: body.rollbackPayload !== undefined,
        sourceRunId,
      },
      phase: "rollback",
      status: "started",
      title: "开始执行 rollback",
      toolName: "trusted_rollback",
    });
    const payload = await getPayloadClient();
    const rollback = await executeTrustedRollbackRequest({
      payload,
      rollbackPayload: body.rollbackPayload,
      sourceRunId,
      userId: authResult.user.id,
    });
    recordBackendTrace({
      actionId: rollback.sourceRunId ? `run:${rollback.sourceRunId}` : undefined,
      latencyMs: Date.now() - rollbackStartedAt,
      outputPreview: {
        sourceRunId: rollback.sourceRunId,
        strategy: rollback.result.strategy,
      },
      phase: "rollback",
      status: "success",
      title: "rollback 执行完成",
      toolName: "trusted_rollback",
    });

    return NextResponse.json({
      backendTraceEvents,
      ok: true,
      result: rollback.result,
      sourceRunId: rollback.sourceRunId,
    });
  } catch (error) {
    recordBackendTrace({
      error: {
        message: error instanceof Error ? error.message : "回滚失败",
        ...(error instanceof Error && error.name ? { name: error.name } : {}),
      },
      phase: "rollback",
      status: "failed",
      title: "rollback 执行失败",
      toolName: "trusted_rollback",
    });

    return NextResponse.json(
      {
        backendTraceEvents,
        message: error instanceof Error ? error.message : "回滚失败",
      },
      { status: 400 },
    );
  }
}
