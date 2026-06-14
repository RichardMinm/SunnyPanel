import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { ContentOutlineItem, RichContentDocument } from "@/lib/rich-content/types";

export type WritingDocumentListItem = {
  advancedAdminHref: string;
  collection: DashboardContentCollection;
  editHref: string;
  excerpt: string;
  id: number;
  publicHref: null | string;
  status: "draft" | "published";
  title: string;
  updatedAt: string;
  visibility: "private" | "public";
};

export type WritingDocument = WritingDocumentListItem & {
  contentExcerpt: string;
  contentOutline: ContentOutlineItem[];
  contentRich: RichContentDocument;
  contentText: string;
  metadata: Record<string, unknown>;
  publishedAt?: null | string;
};

export type WritingDocumentPatch = {
  category?: string;
  contentRich?: RichContentDocument;
  link?: string;
  mood?: string;
  pinned?: boolean;
  slug?: string;
  summary?: string;
  tags?: string[];
  title?: string;
  type?: "life" | "project" | "work";
  visibility?: "private" | "public";
};

export type WritingCollectionFilter = "all" | DashboardContentCollection;

export type WritingSaveState = "dirty" | "error" | "idle" | "saving" | "saved";
