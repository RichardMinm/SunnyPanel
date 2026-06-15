import type { WritingDocument } from "./writing-types";

export type WritingMetadataDraft = {
  category: string;
  link: string;
  mood: string;
  pinned: boolean;
  slug: string;
  summary: string;
  tags: string;
  type: "life" | "project" | "work";
  visibility: "private" | "public";
};

const readString = (metadata: Record<string, unknown>, key: string) =>
  typeof metadata[key] === "string" ? metadata[key] : "";

export const buildMetadataDraft = (document: WritingDocument): WritingMetadataDraft => ({
  category: readString(document.metadata, "category") || "note",
  link: readString(document.metadata, "link"),
  mood: readString(document.metadata, "mood"),
  pinned: document.metadata.pinned === true,
  slug: readString(document.metadata, "slug"),
  summary: readString(document.metadata, "summary"),
  tags: Array.isArray(document.metadata.tags)
    ? document.metadata.tags.filter((tag): tag is string => typeof tag === "string").join(", ")
    : "",
  type:
    document.metadata.type === "work" || document.metadata.type === "project"
      ? document.metadata.type
      : "life",
  visibility: document.visibility,
});

export const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const canEditTitle = (document: WritingDocument) =>
  document.collection === "posts" || document.collection === "pages";

export const getTitleValue = (document: WritingDocument) =>
  typeof document.metadata.title === "string" ? document.metadata.title : document.title;

export const showsSummaryField = (collection: WritingDocument["collection"]) =>
  collection === "posts" || collection === "pages";
