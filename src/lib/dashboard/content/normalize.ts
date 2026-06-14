import type { Note, Page, Post, Update } from "@/payload-types";

import {
  getAdvancedAdminHref,
  getDashboardEditHref,
  getPublicContentHref,
  type DashboardContentCollection,
} from "./config";

type DashboardDoc = Note | Page | Post | Update;

const fallbackTitle = (collection: DashboardContentCollection, doc: DashboardDoc) => {
  if ("title" in doc && typeof doc.title === "string" && doc.title.trim()) {
    return doc.title;
  }

  if (typeof doc.contentExcerpt === "string" && doc.contentExcerpt.trim()) {
    return doc.contentExcerpt;
  }

  return `${collection} #${doc.id}`;
};

export const normalizeDashboardContentListItem = (collection: DashboardContentCollection, doc: DashboardDoc) => {
  const slug = "slug" in doc && typeof doc.slug === "string" ? doc.slug : null;

  return {
    advancedAdminHref: getAdvancedAdminHref(collection, doc.id),
    collection,
    editHref: getDashboardEditHref(collection, doc.id),
    excerpt: doc.contentExcerpt ?? "",
    id: doc.id,
    publicHref: getPublicContentHref({ collection, slug }),
    status: doc.status,
    title: fallbackTitle(collection, doc),
    updatedAt: doc.updatedAt,
    visibility: doc.visibility,
  };
};

export const normalizeDashboardContentDocument = (collection: DashboardContentCollection, doc: DashboardDoc) => ({
  ...normalizeDashboardContentListItem(collection, doc),
  contentExcerpt: doc.contentExcerpt ?? "",
  contentOutline: doc.contentOutline ?? [],
  contentRich: doc.contentRich,
  contentText: doc.contentText ?? "",
  metadata: doc,
  publishedAt: "publishedAt" in doc ? doc.publishedAt ?? null : null,
});
