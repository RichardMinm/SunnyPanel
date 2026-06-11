import type { DashboardContentKind, DashboardContentProfile, RichContentDocument } from "./types";

export const RICH_CONTENT_VERSION = "tiptap-v1";

export const createEmptyRichDocument = (): RichContentDocument => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: {
        id: "root-paragraph",
      },
    },
  ],
});

export const dashboardContentProfiles: Record<DashboardContentKind, DashboardContentProfile> = {
  notes: {
    kind: "notes",
    label: "短札",
    summaryMode: "derived",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: true,
    supportsPinned: true,
    supportsSlug: false,
    supportsTags: false,
    supportsUpdateType: false,
    titleMode: "derived",
  },
  pages: {
    kind: "pages",
    label: "页面",
    summaryMode: "none",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: true,
    supportsTags: false,
    supportsUpdateType: false,
    titleMode: "required",
  },
  posts: {
    kind: "posts",
    label: "文章",
    summaryMode: "required",
    supportsCoverImage: true,
    supportsLink: false,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: true,
    supportsTags: true,
    supportsUpdateType: false,
    titleMode: "required",
  },
  updates: {
    kind: "updates",
    label: "动态",
    summaryMode: "derived",
    supportsCoverImage: true,
    supportsLink: true,
    supportsMood: false,
    supportsPinned: false,
    supportsSlug: false,
    supportsTags: false,
    supportsUpdateType: true,
    titleMode: "derived",
  },
};

export const getDashboardContentProfile = (kind: DashboardContentKind) => dashboardContentProfiles[kind];
