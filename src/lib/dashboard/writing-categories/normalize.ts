import type { WritingCategory } from "@/payload-types";

export type WritingCategoryIcon =
  | "archive"
  | "document"
  | "layers"
  | "note"
  | "pencil"
  | "post"
  | "sparkle";

export type WritingCategoryTint = "accent" | "info" | "muted" | "success" | "warning";

export type WritingCategoryListItem = {
  archived: boolean;
  icon: WritingCategoryIcon;
  id: number;
  parentId: null | number;
  sortOrder: number;
  tint: WritingCategoryTint;
  title: string;
  updatedAt: string;
};

export const isWritingCategoryIcon = (value: unknown): value is WritingCategoryIcon =>
  value === "post" ||
  value === "note" ||
  value === "sparkle" ||
  value === "document" ||
  value === "pencil" ||
  value === "layers" ||
  value === "archive";

export const isWritingCategoryTint = (value: unknown): value is WritingCategoryTint =>
  value === "accent" ||
  value === "info" ||
  value === "warning" ||
  value === "success" ||
  value === "muted";

export const normalizeWritingCategoryListItem = (doc: WritingCategory): WritingCategoryListItem => ({
  archived: Boolean(doc.archived),
  icon: isWritingCategoryIcon(doc.icon) ? doc.icon : "layers",
  id: doc.id,
  parentId: resolveWritingCategoryId((doc as WritingCategory & { parent?: unknown }).parent),
  sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
  tint: isWritingCategoryTint(doc.tint) ? doc.tint : "accent",
  title: doc.title?.trim() || "未命名文档集",
  updatedAt: doc.updatedAt,
});

export const resolveWritingCategoryId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "object" && value && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id) && id > 0) {
      return id;
    }
  }

  return null;
};
