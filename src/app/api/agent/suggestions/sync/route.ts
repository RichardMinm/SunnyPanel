import { NextResponse } from "next/server";

import { syncAgentSuggestionsFromWorkspaceSnapshot } from "@/lib/agent/suggestions";
import { createServerTiming } from "@/lib/observability/server-timing";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";
import { getPayloadAuthResult } from "@/lib/payload/auth";

/**
 * POST /api/agent/suggestions/sync
 *
 * Runs the workspace snapshot → suggestion generation → LLM enhancement → DB sync
 * pipeline that was previously executed on every dashboard page load server-side.
 *
 * This endpoint is intentionally not called when Dashboard mounts. It remains an
 * authenticated, explicit maintenance boundary for callers that can await and
 * observe the expensive generation work. Content publication invokes the same
 * service directly after the relevant business event.
 */
export async function POST() {
  const timing = createServerTiming("POST /api/agent/suggestions/sync");

  /* Auth check — same as before */
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) {
    return NextResponse.json(
      { message: "当前会话没有登录。" },
      { status: 401 },
    );
  }

  try {
    /* Workspace snapshot (the heavy part: 22+ queries) */
    const snapshot = await timing.measure("workspace-snapshot", () =>
      getCachedWorkspaceSnapshot(),
    );

    /* Suggestion generation + LLM enhancement + DB sync */
    await timing.measure("suggestion-sync", () =>
      syncAgentSuggestionsFromWorkspaceSnapshot(snapshot),
    );

    timing.log();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[suggestions/sync] Failed:", error);
    return NextResponse.json(
      { message: "建议同步失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
