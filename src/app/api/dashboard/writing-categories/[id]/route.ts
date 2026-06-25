import { NextResponse } from "next/server";

import { dashboardContentCollections } from "@/lib/dashboard/content/config";
import { mapPayloadError } from "@/lib/dashboard/content/api-errors";
import {
  isWritingCategoryIcon,
  isWritingCategoryTint,
  normalizeWritingCategoryListItem,
} from "@/lib/dashboard/writing-categories/normalize";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type WritingCategoryDetailContext = {
  params: Promise<{
    id: string;
  }>;
};

const parseCategoryId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const parseBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const clearCategoryFromDocuments = async (
  categoryId: number,
  user: NonNullable<Awaited<ReturnType<typeof getPayloadAuthResult>>["user"]>,
) => {
  const payload = await getPayloadClient();

  await Promise.all(
    dashboardContentCollections.map(async (collection) => {
      let page = 1;

      while (true) {
        const linked = await payload.find({
          collection,
          depth: 0,
          limit: 200,
          overrideAccess: false,
          page,
          user,
          where: {
            writingCategory: {
              equals: categoryId,
            },
          },
        });

        if (linked.docs.length === 0) {
          break;
        }

        await Promise.all(
          linked.docs.map((doc) =>
            payload.update({
              collection,
              data: {
                writingCategory: null,
              },
              id: doc.id,
              overrideAccess: false,
              user,
            }),
          ),
        );

        if (!linked.hasNextPage) {
          break;
        }

        page += 1;
      }
    }),
  );
};

export async function PATCH(request: Request, context: WritingCategoryDetailContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const params = await context.params;
  const id = parseCategoryId(params.id);

  if (!id) {
    return NextResponse.json({ message: "文档集不存在" }, { status: 404 });
  }

  const body = await parseBody(request);
  const payload = await getPayloadClient();
  const existing = await payload
    .findByID({
      collection: "writing-categories",
      depth: 0,
      id,
      overrideAccess: false,
      user: authResult.user,
    })
    .catch(() => null);

  if (!existing) {
    return NextResponse.json({ message: "文档集不存在" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body?.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }

  if (isWritingCategoryIcon(body?.icon)) {
    data.icon = body.icon;
  }

  if (isWritingCategoryTint(body?.tint)) {
    data.tint = body.tint;
  }

  if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = body.sortOrder;
  }

  if (typeof body?.archived === "boolean") {
    data.archived = body.archived;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "没有可更新字段" }, { status: 400 });
  }

  try {
    const doc = await payload.update({
      collection: "writing-categories",
      data: data as never,
      id,
      overrideAccess: false,
      user: authResult.user,
    });

    return NextResponse.json({ category: normalizeWritingCategoryListItem(doc) });
  } catch (error) {
    return mapPayloadError(error, "更新文档集失败");
  }
}

export async function DELETE(_request: Request, context: WritingCategoryDetailContext) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const params = await context.params;
  const id = parseCategoryId(params.id);

  if (!id) {
    return NextResponse.json({ message: "文档集不存在" }, { status: 404 });
  }

  const payload = await getPayloadClient();
  const existing = await payload
    .findByID({
      collection: "writing-categories",
      depth: 0,
      id,
      overrideAccess: false,
      user: authResult.user,
    })
    .catch(() => null);

  if (!existing) {
    return NextResponse.json({ message: "文档集不存在" }, { status: 404 });
  }

  try {
    await clearCategoryFromDocuments(id, authResult.user);
    await payload.delete({
      collection: "writing-categories",
      id,
      overrideAccess: false,
      user: authResult.user,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mapPayloadError(error, "删除文档集失败");
  }
}
