import { NextResponse } from "next/server";

import { mapPayloadError } from "@/lib/dashboard/content/api-errors";
import { normalizeDashboardContentDocument } from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentBody,
  parseDashboardContentId,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type VersionRouteContext = {
  params: Promise<{ collection: string; id: string }>;
};

const resolveTarget = async (context: VersionRouteContext) => {
  const params = await context.params;
  const collection = validateDashboardContentCollection(params.collection);
  const id = parseDashboardContentId(params.id);

  return collection && id !== null ? { collection, id } : null;
};

const getParentId = (parent: unknown) => {
  if (typeof parent === "number" || typeof parent === "string") return String(parent);
  if (parent && typeof parent === "object" && "id" in parent) {
    return String((parent as { id: unknown }).id);
  }
  return null;
};

export async function GET(_request: Request, context: VersionRouteContext) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const target = await resolveTarget(context);
  if (!target) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();

  try {
    const result = await payload.findVersions({
      collection: target.collection,
      depth: 0,
      limit: 20,
      overrideAccess: false,
      sort: "-createdAt",
      user: authResult.user,
      where: { parent: { equals: target.id } },
    });

    const versions = result.docs
      .filter((item) => getParentId(item.parent) === String(target.id))
      .map((item) => {
        const document = normalizeDashboardContentDocument(
          target.collection,
          {
            ...item.version,
            createdAt: item.createdAt,
            id: target.id,
            updatedAt: item.createdAt,
          } as never,
        );
        return {
          createdAt: item.createdAt,
          excerpt: document.excerpt,
          id: String(item.id),
          status: document.status,
          title: document.title,
        };
      });

    return NextResponse.json({ versions });
  } catch (error) {
    return mapPayloadError(error, "加载版本历史失败");
  }
}

export async function POST(request: Request, context: VersionRouteContext) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const target = await resolveTarget(context);
  if (!target) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const body = await parseDashboardContentBody(request);
  const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
  if (!versionId) {
    return NextResponse.json({ message: "请选择要恢复的版本" }, { status: 400 });
  }

  const payload = await getPayloadClient();

  try {
    const version = await payload.findVersionByID({
      collection: target.collection,
      depth: 0,
      id: versionId,
      overrideAccess: false,
      user: authResult.user,
    });

    if (getParentId(version.parent) !== String(target.id)) {
      return NextResponse.json({ message: "版本与当前文档不匹配" }, { status: 404 });
    }

    const restored = await payload.restoreVersion({
      collection: target.collection,
      depth: 2,
      id: versionId,
      overrideAccess: false,
      user: authResult.user,
    });

    return NextResponse.json({
      document: normalizeDashboardContentDocument(target.collection, restored as never),
    });
  } catch (error) {
    return mapPayloadError(error, "恢复版本失败");
  }
}
