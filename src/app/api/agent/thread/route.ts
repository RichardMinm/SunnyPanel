import { NextResponse } from "next/server";

import { parsePendingAction, sanitizeChatMessages } from "@/lib/agent/schemas";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const parseThreadId = (value: null | string) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const getRelationId = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value && typeof value.id === "number") {
    return value.id;
  }

  return null;
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json(
      {
        assistantMessage: "当前会话没有登录，暂时不能读取 Agent 会话。",
      },
      { status: 401 },
    );
  }

  const payload = await getPayloadClient();
  const url = new URL(request.url);
  const requestedThreadId = parseThreadId(url.searchParams.get("threadId"));
  const threads = await payload.find({
    collection: "agent-threads",
    depth: 0,
    limit: 8,
    overrideAccess: true,
    sort: "-lastInteractionAt",
    where: {
      user: {
        equals: authResult.user.id,
      },
    },
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
          messages: sanitizeChatMessages(ownedSelectedThread.messages ?? []),
          pendingAction: parsePendingAction(ownedSelectedThread.pendingAction),
          title: ownedSelectedThread.title,
        }
      : null,
    threads: threads.docs.map((thread) => ({
      id: thread.id,
      lastInteractionAt: thread.lastInteractionAt,
      pendingAction: parsePendingAction(thread.pendingAction),
      title: thread.title,
    })),
  });
}
