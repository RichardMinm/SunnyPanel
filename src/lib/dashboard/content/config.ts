import type { DashboardContentKind } from "@/lib/rich-content/types";

export const dashboardContentCollections = ["posts", "notes", "updates", "pages"] as const;

export type DashboardContentCollection = (typeof dashboardContentCollections)[number];

export const dashboardContentLabels: Record<DashboardContentCollection, string> = {
  notes: "短札",
  pages: "页面",
  posts: "文章",
  updates: "动态",
};

export const getDashboardEditHref = (collection: DashboardContentKind, id: number | string) =>
  `/dashboard?mode=writing&collection=${collection}&id=${id}`;

export const getAdvancedAdminHref = (collection: DashboardContentKind, id?: number | string) =>
  id ? `/admin/collections/${collection}/${id}` : `/admin/collections/${collection}`;

export const getPublicContentHref = ({
  collection,
  slug,
}: {
  collection: DashboardContentKind;
  slug?: null | string;
}) => {
  if (collection === "posts" && slug) {
    return `/blog/${slug}`;
  }

  if (collection === "pages" && slug) {
    return `/${slug}`;
  }

  if (collection === "notes") {
    return "/notes";
  }

  if (collection === "updates") {
    return "/updates";
  }

  return null;
};
