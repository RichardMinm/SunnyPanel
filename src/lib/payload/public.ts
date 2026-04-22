import type { Where } from "payload";

import type { Config } from "@/payload-types";
import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadClient } from "@/lib/payload/client";

type QueryOptions = {
  limit?: number;
};

type PublicCollectionSlug =
  | "checklists"
  | "notes"
  | "pages"
  | "posts"
  | "timeline-events"
  | "updates";

type PublicCollectionDocument<TCollection extends PublicCollectionSlug> =
  Config["collections"][TCollection];

type PublicCollectionResult<TCollection extends PublicCollectionSlug> = {
  docs: Array<PublicCollectionDocument<TCollection>>;
};

const withPublicConstraint = (where?: Where): Where => {
  const baseConstraint = publicContentConstraint();

  if (!where) {
    return baseConstraint;
  }

  return {
    and: [baseConstraint, where],
  };
};

const findPublicCollection = async <TCollection extends PublicCollectionSlug>({
  collection,
  depth = 1,
  limit,
  sort,
  where,
}: {
  collection: TCollection;
  depth?: number;
  limit: number;
  sort: string;
  where?: Where;
}): Promise<PublicCollectionResult<TCollection>> => {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection,
    depth,
    limit,
    sort,
    where: withPublicConstraint(where),
  });

  return {
    docs: result.docs as Array<PublicCollectionDocument<TCollection>>,
  };
};

const findSinglePublicCollectionDocument = async <TCollection extends PublicCollectionSlug>({
  collection,
  depth = 1,
  where,
}: {
  collection: TCollection;
  depth?: number;
  where: Where;
}): Promise<null | PublicCollectionDocument<TCollection>> => {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection,
    depth,
    limit: 1,
    pagination: false,
    where: withPublicConstraint(where),
  });

  return (result.docs[0] ?? null) as null | PublicCollectionDocument<TCollection>;
};

export const getPublicPosts = async () => {
  return getPublicPostsWithOptions();
};

export const getPublicPostsWithOptions = async ({ limit = 24 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "posts",
    limit,
    sort: "-publishedAt",
  });
};

export const getPublicPostBySlug = async (slug: string) => {
  return findSinglePublicCollectionDocument({
    collection: "posts",
    where: {
      slug: {
        equals: slug,
      },
    },
  });
};

export const getPublicPageBySlug = async (slug: string) => {
  return findSinglePublicCollectionDocument({
    collection: "pages",
    where: {
      slug: {
        equals: slug,
      },
    },
  });
};

export const getPublicPages = async ({ limit = 20 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "pages",
    limit,
    sort: "title",
  });
};

export const getPublicNotes = async ({ limit = 30 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "notes",
    limit,
    sort: "-createdAt",
  });
};

export const getPublicUpdates = async ({ limit = 30 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "updates",
    limit,
    sort: "-createdAt",
  });
};

export const getPublicChecklists = async ({ limit = 20 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "checklists",
    depth: 0,
    limit,
    sort: "-updatedAt",
  });
};

type TimelineQueryOptions = QueryOptions & {
  featuredOnly?: boolean;
};

export const getPublicTimelineEvents = async ({
  featuredOnly = false,
  limit = 100,
}: TimelineQueryOptions = {}) => {
  return findPublicCollection({
    collection: "timeline-events",
    limit,
    sort: "-eventDate",
    where: featuredOnly
      ? {
          isFeatured: {
            equals: true,
          },
        }
      : undefined,
  });
};
