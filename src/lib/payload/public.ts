import type { Where } from "payload";

import type { Config } from "@/payload-types";
import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadClient } from "@/lib/payload/client";
import { normalizeTag, slugify } from "@/lib/taxonomy-helpers";

type QueryOptions = {
  limit?: number;
};

type PublicCollectionSlug =
  | "notes"
  | "pages"
  | "posts"
  | "timeline-events";

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
    overrideAccess: false,
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
    overrideAccess: false,
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

export const getPublicNotes = async ({ limit = 30 }: QueryOptions = {}) => {
  return findPublicCollection({
    collection: "notes",
    limit,
    sort: "-createdAt",
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

/* ── Tag / Category public queries ── */

export const getPublicPostsByTag = async (tag: string) => {
  const decoded = decodeURIComponent(tag);
  const normalized = normalizeTag(decoded);

  /* Fetch a generous batch of public posts, then filter with normalized
   * exact match in-process so that e.g. /tags/ai does NOT match "daily" */
  const { docs: allPosts } = await findPublicCollection({
    collection: "posts",
    limit: 500,
    sort: "-publishedAt",
  });

  const filtered = allPosts.filter((post) =>
    (post.tags ?? []).some((t) => normalizeTag(t) === normalized),
  );

  return { docs: filtered.slice(0, 24) };
};

async function resolveWritingCategoryBySlug(
  slug: string,
): Promise<{ id: number; title: string } | null> {
  const payload = await getPayloadClient();
  const decoded = decodeURIComponent(slug);
  const normalized = slugify(decoded);

  const result = await payload.find({
    collection: "writing-categories",
    overrideAccess: true,
    limit: 200,
  });

  const match = result.docs.find(
    (cat) => slugify((cat as { title?: string }).title ?? "") === normalized,
  );

  if (!match) return null;
  return {
    id: match.id as number,
    title: (match as { title?: string }).title ?? "",
  };
}

export const getPublicPostsByWritingCategoryId = async (categoryId: number) => {
  return findPublicCollection({
    collection: "posts",
    limit: 24,
    sort: "-publishedAt",
    where: {
      writingCategory: {
        equals: categoryId,
      },
    },
  });
};

export const getPublicPostsByCategorySlug = async (slug: string) => {
  const resolved = await resolveWritingCategoryBySlug(slug);
  if (resolved === null) return null;
  return getPublicPostsByWritingCategoryId(resolved.id);
};

export { resolveWritingCategoryBySlug };
