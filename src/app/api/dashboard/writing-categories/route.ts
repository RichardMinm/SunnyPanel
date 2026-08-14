import { NextResponse } from "next/server";

import {
  isWritingCategoryIcon,
  isWritingCategoryTint,
  normalizeWritingCategoryListItem,
} from "@/lib/dashboard/writing-categories/normalize";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const parseParentId = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

const parseBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "writing-categories",
    depth: 0,
    limit: 200,
    overrideAccess: false,
    sort: "sortOrder,title",
    user: authResult.user,
    where: includeArchived
      ? undefined
      : {
          archived: {
            equals: false,
          },
        },
  });

  return NextResponse.json({
    categories: result.docs.map((doc) => normalizeWritingCategoryListItem(doc)),
  });
}

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = await parseBody(request);
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json({ message: "文档集名称不能为空" }, { status: 400 });
  }

  const icon = isWritingCategoryIcon(body?.icon) ? body.icon : "layers";
  const tint = isWritingCategoryTint(body?.tint) ? body.tint : "accent";
  const payload = await getPayloadClient();
  const parentId = parseParentId(body?.parentId);

  if (parentId === undefined) {
    return NextResponse.json({ message: "上级文档集无效" }, { status: 400 });
  }

  if (parentId !== null) {
    const parent = await payload.findByID({
      collection: "writing-categories",
      depth: 0,
      id: parentId,
      overrideAccess: false,
      user: authResult.user,
    }).catch(() => null);
    if (!parent) {
      return NextResponse.json({ message: "上级文档集不存在" }, { status: 400 });
    }
  }
  const existing = await payload.find({
    collection: "writing-categories",
    depth: 0,
    limit: 1,
    overrideAccess: false,
    sort: "-sortOrder",
    user: authResult.user,
  });
  const nextSortOrder =
    existing.docs[0] && typeof existing.docs[0].sortOrder === "number"
      ? existing.docs[0].sortOrder + 1
      : 0;

  const doc = await payload.create({
    collection: "writing-categories",
    data: {
      archived: false,
      icon,
      parent: parentId,
      sortOrder: nextSortOrder,
      tint,
      title,
    },
    overrideAccess: false,
    user: authResult.user,
  });

  return NextResponse.json(
    { category: normalizeWritingCategoryListItem(doc) },
    { status: 201 },
  );
}
