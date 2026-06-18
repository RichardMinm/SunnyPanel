import { type NextRequest, NextResponse } from "next/server";
import type { Where } from "payload";

import { buildAgentRunOwnerWhere, getRelationId } from "@/lib/agent/run-access";
import { parsePendingAction, sanitizeChatMessages } from "@/lib/agent/schemas";
import { toAgentRunSummary } from "@/lib/agent/run-summary";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const parseThreadId = (value: null | string) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        message: "当前会话没有登录，暂时不能读取 Agent 会话。",
      },
      { status: 401 },
    );
  }

  const payload = await getPayloadClient();
  const url = new URL(request.url);
  const requestedThreadId = parseThreadId(url.searchParams.get("threadId"));
  const searchQuery = url.searchParams.get("q")?.trim() || null;
  const showArchived = url.searchParams.get("archived") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 50);

  const conditions: Where[] = [
    { user: { equals: authResult.user.id } },
  ];

  if (showArchived) {
    conditions.push({ archived: { equals: true } });
  } else {
    conditions.push({
      or: [
        { archived: { equals: false } },
        { archived: { exists: false } },
      ],
    });
  }

  if (searchQuery) {
    conditions.push({ title: { contains: searchQuery } });
  }

  const threadWhere: Where = conditions.length === 1 ? conditions[0] : { and: conditions };

  const threads = await payload.find({
    collection: "agent-threads",
    depth: 0,
    limit,
    overrideAccess: true,
    sort: "-lastInteractionAt",
    where: threadWhere,
  });
  const recentRuns = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 6,
    overrideAccess: true,
    sort: "-startedAt",
    where: buildAgentRunOwnerWhere(authResult.user.id),
  });
  const selectedThread =
    requestedThreadId !== null
      ? threads.docs.find((thread) => thread.id === requestedThreadId) ??
        ((await payload
          .findByID({
            collection: "agent-threads",
            depth: 0,
            id: requestedThreadId,
            overrideAccess: true,
          })
          .catch(() => null)) as (typeof threads.docs)[number] | null)
      : threads.docs[0] ?? null;
  const ownedSelectedThread =
    selectedThread && getRelationId(selectedThread.user) === authResult.user.id ? selectedThread : null;

  return NextResponse.json({
    selectedThread: ownedSelectedThread
      ? {
          id: ownedSelectedThread.id,
          lastInteractionAt: ownedSelectedThread.lastInteractionAt,
          messages: sanitizeChatMessages(ownedSelectedThread.messages ?? []),
          pendingAction: parsePendingAction(ownedSelectedThread.pendingAction),
          title: ownedSelectedThread.title,
        }
      : null,
    threads: threads.docs.map((thread) => ({
      archived: Boolean(thread.archived),
      id: thread.id,
      lastInteractionAt: thread.lastInteractionAt,
      pendingAction: parsePendingAction(thread.pendingAction),
      tags: Array.isArray(thread.tags) ? thread.tags as string[] : [],
      title: thread.title,
    })),
    totalThreads: threads.totalDocs,
    recentRuns: recentRuns.docs.map((run) => toAgentRunSummary(run as unknown as Record<string, unknown>)),
  });
}

export async function PATCH(request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json()) as {
    archived?: boolean;
    id?: number;
    tags?: string[];
    title?: string;
  };

  if (!body.id || typeof body.id !== "number") {
    return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  }

  const payload = await getPayloadClient();

  const thread = await payload.findByID({
    collection: "agent-threads",
    depth: 0,
    id: body.id,
    overrideAccess: true,
  }).catch(() => null);

  if (!thread || getRelationId(thread.user) !== authResult.user.id) {
    return NextResponse.json({ message: "Thread 不存在或无权限" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (typeof body.archived === "boolean") {
    updateData.archived = body.archived;
  }

  if (Array.isArray(body.tags)) {
    updateData.tags = body.tags.filter((t): t is string => typeof t === "string").slice(0, 10);
  }

  if (typeof body.title === "string" && body.title.trim().length > 0 && body.title.trim().length <= 200) {
    updateData.title = body.title.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: "无更新字段" }, { status: 400 });
  }

  await payload.update({
    collection: "agent-threads",
    id: body.id,
    data: updateData,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}
