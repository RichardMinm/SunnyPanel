import { NextResponse } from "next/server";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import { normalizeDashboardContentDocument } from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentBody,
  parseDashboardContentId,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type DashboardContentDetailContext = {
  params: Promise<{
    collection: string;
    id: string;
  }>;
};

const mutableKeysByCollection: Record<DashboardContentCollection, Set<string>> = {
  notes: new Set(["category", "contentRich", "coverImage", "mood", "pinned", "status", "visibility"]),
  pages: new Set(["contentRich", "coverImage", "slug", "status", "title", "visibility"]),
  posts: new Set(["contentRich", "coverImage", "publishedAt", "slug", "status", "summary", "tags", "title", "visibility"]),
  updates: new Set(["contentRich", "coverImage", "link", "status", "type", "visibility"]),
};

const resolveTarget = async (context: DashboardContentDetailContext) => {
  const params = await context.params;
  const collection = validateDashboardContentCollection(params.collection);
  const id = parseDashboardContentId(params.id);

  if (!collection || id === null) {
    return null;
  }

  return { collection, id };
};

const pickPatchData = (collection: DashboardContentCollection, body: Record<string, unknown>) => {
  const allowedKeys = mutableKeysByCollection[collection];
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.has(key)) {
      data[key] = value;
    }
  }

  return data;
};

export async function GET(_request: Request, context: DashboardContentDetailContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const target = await resolveTarget(context);

  if (!target) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();
  const doc = await payload
    .findByID({
      collection: target.collection,
      depth: 2,
      id: target.id,
      overrideAccess: false,
      user: authResult.user,
    })
    .catch(() => null);

  if (!doc) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  return NextResponse.json({ document: normalizeDashboardContentDocument(target.collection, doc as never) });
}

export async function PATCH(request: Request, context: DashboardContentDetailContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const target = await resolveTarget(context);

  if (!target) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const body = await parseDashboardContentBody(request);
  const payload = await getPayloadClient();
  const existing = await payload
    .findByID({
      collection: target.collection,
      depth: 0,
      id: target.id,
      overrideAccess: false,
      user: authResult.user,
    })
    .catch(() => null);

  if (!existing) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const lastKnownUpdatedAt = typeof body.lastKnownUpdatedAt === "string" ? body.lastKnownUpdatedAt : null;

  if (lastKnownUpdatedAt && existing.updatedAt !== lastKnownUpdatedAt) {
    return NextResponse.json({ message: "内容已在其他位置更新" }, { status: 409 });
  }

  const data = pickPatchData(target.collection, body);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "没有可更新字段" }, { status: 400 });
  }

  const doc = await payload.update({
    collection: target.collection,
    data: data as never,
    id: target.id,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ document: normalizeDashboardContentDocument(target.collection, doc as never) });
}

export async function DELETE(_request: Request, context: DashboardContentDetailContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const target = await resolveTarget(context);

  if (!target) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();

  await payload.delete({
    collection: target.collection,
    id: target.id,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ ok: true });
}
