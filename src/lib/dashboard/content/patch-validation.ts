import type { Payload } from "payload";

import { isRichContentDocument } from "@/lib/rich-content/validate";

type PayloadUser = NonNullable<Awaited<ReturnType<typeof import("@/lib/payload/auth").getPayloadAuthResult>>["user"]>;

export const parsePatchContentRich = (
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (value === undefined) {
    return { ok: false, message: "缺少正文内容" };
  }

  if (!isRichContentDocument(value)) {
    return { ok: false, message: "正文格式无效" };
  }

  return { ok: true, value };
};

export const parseRelationshipId = (value: unknown): null | number => {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

export const validateWritingCategoryId = async (
  payload: Payload,
  categoryId: null | number,
  user: PayloadUser,
): Promise<null | string> => {
  if (categoryId === null) {
    return null;
  }

  const category = await payload
    .findByID({
      collection: "writing-categories",
      depth: 0,
      id: categoryId,
      overrideAccess: false,
      user,
    })
    .catch(() => null);

  if (!category) {
    return "文档集不存在";
  }

  if (category.archived) {
    return "文档集已归档，无法关联";
  }

  return null;
};

export const validateCoverImageId = async (
  payload: Payload,
  mediaId: null | number,
  user: PayloadUser,
): Promise<null | string> => {
  if (mediaId === null) {
    return null;
  }

  const media = await payload
    .findByID({
      collection: "media",
      depth: 0,
      id: mediaId,
      overrideAccess: false,
      user,
    })
    .catch(() => null);

  return media ? null : "头图不存在";
};

export const validatePatchRelationships = async (
  payload: Payload,
  data: Record<string, unknown>,
  user: PayloadUser,
): Promise<null | string> => {
  if ("writingCategory" in data) {
    const categoryError = await validateWritingCategoryId(
      payload,
      parseRelationshipId(data.writingCategory),
      user,
    );
    if (categoryError) {
      return categoryError;
    }
  }

  if ("coverImage" in data) {
    const coverError = await validateCoverImageId(payload, parseRelationshipId(data.coverImage), user);
    if (coverError) {
      return coverError;
    }
  }

  return null;
};
