import { NextResponse } from "next/server";

import { normalizeDashboardContentDocument } from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentId,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type DashboardContentPublishContext = {
  params: Promise<{
    collection: string;
    id: string;
  }>;
};

export async function POST(_request: Request, context: DashboardContentPublishContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const params = await context.params;
  const collection = validateDashboardContentCollection(params.collection);
  const id = parseDashboardContentId(params.id);

  if (!collection || id === null) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();
  const existing = await payload
    .findByID({
      collection,
      depth: 0,
      id,
      overrideAccess: false,
      user: authResult.user,
    })
    .catch(() => null);

  if (!existing) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const data: Record<string, unknown> = {
    status: "published",
  };

  if ("publishedAt" in existing) {
    data.publishedAt = existing.publishedAt ?? new Date().toISOString();
  }

  const doc = await payload.update({
    collection,
    data: data as never,
    id,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ document: normalizeDashboardContentDocument(collection, doc as never) });
}
