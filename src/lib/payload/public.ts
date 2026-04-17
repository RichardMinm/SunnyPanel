import type { Where } from "payload";

import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadClient } from "@/lib/payload/client";

type QueryOptions = {
  limit?: number;
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

export const getPublicPosts = async () => {
  return getPublicPostsWithOptions();
};

export const getPublicPostsWithOptions = async ({ limit = 24 }: QueryOptions = {}) => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "posts",
    depth: 1,
    limit,
    sort: "-publishedAt",
    where: publicContentConstraint(),
  });
};

export const getPublicPostBySlug = async (slug: string) => {
  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 1,
    pagination: false,
    where: withPublicConstraint({
      slug: {
        equals: slug,
      },
    }),
  });

  return result.docs[0] ?? null;
};

export const getPublicNotes = async ({ limit = 30 }: QueryOptions = {}) => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "notes",
    limit,
    sort: "-createdAt",
    where: publicContentConstraint(),
  });
};

export const getPublicUpdates = async ({ limit = 30 }: QueryOptions = {}) => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "updates",
    limit,
    sort: "-createdAt",
    where: publicContentConstraint(),
  });
};

type TimelineQueryOptions = QueryOptions & {
  featuredOnly?: boolean;
};

export const getPublicTimelineEvents = async ({
  featuredOnly = false,
  limit = 100,
}: TimelineQueryOptions = {}) => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "timeline-events",
    depth: 1,
    limit,
    sort: "-eventDate",
    where: withPublicConstraint(
      featuredOnly
        ? {
            isFeatured: {
              equals: true,
            },
          }
        : undefined,
    ),
  });
};
