import type { DashboardIconName } from "@/components/dashboard/icons";
import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type {
  WritingCategoryIcon,
  WritingCategoryTint,
} from "@/lib/dashboard/writing-categories/normalize";

export type WritingCollectionMeta = {
  icon: DashboardIconName;
  tintVar: string;
};

export const WRITING_COLLECTION_META: Record<DashboardContentCollection, WritingCollectionMeta> = {
  notes: {
    icon: "note",
    tintVar: "--writing-collection-notes-tint",
  },
  pages: {
    icon: "document",
    tintVar: "--writing-collection-pages-tint",
  },
  posts: {
    icon: "post",
    tintVar: "--writing-collection-posts-tint",
  },
  updates: {
    icon: "sparkle",
    tintVar: "--writing-collection-updates-tint",
  },
};

export const WRITING_CATEGORY_ICON_PRESETS: Array<{
  icon: WritingCategoryIcon;
  label: string;
}> = [
  { icon: "layers", label: "集合" },
  { icon: "post", label: "文章" },
  { icon: "note", label: "短札" },
  { icon: "sparkle", label: "动态" },
  { icon: "document", label: "页面" },
  { icon: "pencil", label: "写作" },
  { icon: "archive", label: "归档" },
];

export const WRITING_CATEGORY_TINT_PRESETS: Array<{
  label: string;
  tint: WritingCategoryTint;
}> = [
  { label: "强调", tint: "accent" },
  { label: "信息", tint: "info" },
  { label: "警示", tint: "warning" },
  { label: "成功", tint: "success" },
  { label: "中性", tint: "muted" },
];

export const getWritingCollectionMeta = (collection: DashboardContentCollection) =>
  WRITING_COLLECTION_META[collection];

export const getWritingCategoryTintVar = (tint: WritingCategoryTint) =>
  `--writing-category-tint-${tint}`;

export const isWritingCategoryIconName = (icon: WritingCategoryIcon): DashboardIconName => icon;
