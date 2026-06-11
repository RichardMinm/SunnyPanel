export type DashboardContentKind = "notes" | "pages" | "posts" | "updates";

export type RichContentNode = {
  attrs?: Record<string, unknown>;
  content?: RichContentNode[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type: string;
};

export type RichContentBlock = RichContentNode;

export type RichContentDocument = {
  content?: RichContentBlock[];
  type: "doc";
};

export type ContentOutlineItem = {
  id: string;
  level: 1 | 2 | 3;
  order: number;
  text: string;
};

export type DerivedRichContentFields = {
  contentExcerpt: string;
  contentOutline: ContentOutlineItem[];
  contentText: string;
  readingMinutes: number;
};

export type DashboardContentProfile = {
  kind: DashboardContentKind;
  label: string;
  summaryMode: "derived" | "none" | "required";
  supportsCoverImage: boolean;
  supportsLink: boolean;
  supportsMood: boolean;
  supportsPinned: boolean;
  supportsSlug: boolean;
  supportsTags: boolean;
  supportsUpdateType: boolean;
  titleMode: "derived" | "required";
};
