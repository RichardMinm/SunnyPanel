import { NextResponse } from "next/server";

import { dashboardContentCollections } from "@/lib/dashboard/content/config";
import { normalizeDashboardContentListItem } from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentId,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type BacklinkRouteContext = { params: Promise<{ collection: string; id: string }> };

const linksToDocument = (
  value: unknown,
  collection: string,
  id: number,
): boolean => {
  if (Array.isArray(value)) return value.some((item) => linksToDocument(item, collection, id));
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (record.type === "link" && record.attrs && typeof record.attrs === "object") {
    const href = (record.attrs as Record<string, unknown>).href;
    if (typeof href === "string") {
      try {
        const url = new URL(href, "https://sunny.local");
        if (
          url.pathname === "/dashboard" &&
          url.searchParams.get("mode") === "writing" &&
          url.searchParams.get("collection") === collection &&
          url.searchParams.get("id") === String(id)
        ) return true;
      } catch {
        return false;
      }
    }
  }

  return Object.values(record).some((item) => linksToDocument(item, collection, id));
};

export async function GET(_request: Request, context: BacklinkRouteContext) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const params = await context.params;
  const collection = validateDashboardContentCollection(params.collection);
  const id = parseDashboardContentId(params.id);
  if (!collection || id === null) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();
  const results = await Promise.all(dashboardContentCollections.map(async (sourceCollection) => {
    const result = await payload.find({
      collection: sourceCollection,
      depth: 0,
      limit: 200,
      overrideAccess: false,
      user: authResult.user,
    });

    return result.docs
      .filter((doc) =>
        !(sourceCollection === collection && doc.id === id) &&
        linksToDocument(doc.contentRich, collection, id),
      )
      .map((doc) => normalizeDashboardContentListItem(sourceCollection, doc as never));
  }));

  return NextResponse.json({ backlinks: results.flat() });
}
