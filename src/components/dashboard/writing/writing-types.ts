import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { ContentOutlineItem, RichContentDocument } from "@/lib/rich-content/types";

import type { WritingMetadataDraft } from "./writing-metadata";

export type WritingDocumentListItem = {
  advancedAdminHref: string;
  categoryId: null | number;
  collection: DashboardContentCollection;
  editHref: string;
  excerpt: string;
  id: number;
  publicHref: null | string;
  status: "draft" | "published" | "archived";
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
  writingCategory?: null | number;
};

export type WritingCollectionFilter = "all" | DashboardContentCollection;

export type WritingDraft = {
  contentRich: RichContentDocument;
  metadata: WritingMetadataDraft;
  summary: string;
  title: string;
};

export type WritingSaveState = "dirty" | "error" | "idle" | "saving" | "saved";

export type WritingSaveStatusSnapshot = {
  error: null | string;
  isDirty: boolean;
  lastEdited?: null | string;
  readingMinutes?: number;
  saveState: WritingSaveState;
  wordCount?: number;
};
