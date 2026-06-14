import { NextResponse } from "next/server";

import { normalizeDashboardContentDocument } from "@/lib/dashboard/content/normalize";
import {
  parseDashboardContentId,
  validateDashboardContentCollection,
} from "@/lib/dashboard/content/validation";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type DashboardContentUnpublishContext = {
  params: Promise<{
    collection: string;
    id: string;
  }>;
};

export async function POST(_request: Request, context: DashboardContentUnpublishContext) {
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
  const doc = await payload.update({
    collection,
    data: {
      status: "draft",
    } as never,
    id,
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json({ document: normalizeDashboardContentDocument(collection, doc as never) });
}
