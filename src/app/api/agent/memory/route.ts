import { NextResponse } from "next/server";
import type { Where } from "payload";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const VALID_TYPES = [
  "fact",
  "preference",
  "project_context",
  "workflow_rule",
  "writing_style",
] as const;

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const query = url.searchParams.get("q")?.trim() || null;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  const conditions: Where[] = [{ status: { equals: "active" } }];

  if (typeParam && (VALID_TYPES as readonly string[]).includes(typeParam)) {
    conditions.push({ type: { equals: typeParam } });
  }

  if (query) {
    conditions.push({ title: { contains: query } });
  }

  const where: Where =
    conditions.length === 1 ? conditions[0] : { and: conditions };

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "agent-memories",
    depth: 0,
    limit,
    overrideAccess: true,
    sort: "-lastUsedAt",
    where,
  });

  const memories = result.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    confidence: doc.confidence ?? 0,
    content: doc.content,
    lastUsedAt: doc.lastUsedAt ?? null,
    updatedAt: doc.updatedAt,
  }));

  return NextResponse.json({ memories, total: result.totalDocs });
}
