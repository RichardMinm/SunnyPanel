import { NextResponse } from "next/server";

import {
  dashboardContentCollections,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";
import {
  normalizeDashboardContentDocument,
  normalizeDashboardContentListItem,
} from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentBody,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";

const createDraftSlug = (collection: DashboardContentCollection) => `draft-${collection}-${Date.now()}`;

const buildCreateData = (collection: DashboardContentCollection, body: Record<string, unknown>) => {
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  const data: Record<string, unknown> = {
    contentRich: createEmptyRichDocument(),
    status: "draft",
    visibility: "private",
  };

  if (collection === "posts") {
    data.title = title ?? "未命名文章";
    data.summary = "待补充摘要";
    data.slug = createDraftSlug(collection);
  }

  if (collection === "pages") {
    data.title = title ?? "未命名页面";
    data.slug = createDraftSlug(collection);
  }

  if (collection === "notes") {
    data.category = "note";
    data.pinned = false;
  }

  if (collection === "updates") {
    data.type = "life";
  }

  return data;
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedCollection = url.searchParams.get("collection");
  const collection = requestedCollection ? validateDashboardContentCollection(requestedCollection) : null;

  if (requestedCollection && !collection) {
    return NextResponse.json({ message: "不支持的内容类型" }, { status: 400 });
  }

  const collections = collection ? [collection] : dashboardContentCollections;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 80);
  const payload = await getPayloadClient();
  const results = await Promise.all(
    collections.map(async (contentCollection) => {
      const result = await payload.find({
        collection: contentCollection,
        depth: 1,
        limit,
        overrideAccess: false,
        sort: "-updatedAt",
        user: authResult.user,
      });

      return result.docs.map((doc) => normalizeDashboardContentListItem(contentCollection, doc as never));
    }),
  );

  return NextResponse.json({
    documents: results
      .flat()
      .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()),
  });
}

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await parseDashboardContentBody(request);
  const collection = validateDashboardContentCollection(String(body.collection ?? ""));

  if (!collection) {
    return NextResponse.json({ message: "不支持的内容类型" }, { status: 400 });
  }

  const payload = await getPayloadClient();
  const doc = await payload.create({
    collection,
    data: buildCreateData(collection, body) as never,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ document: normalizeDashboardContentDocument(collection, doc as never) }, { status: 201 });
}
