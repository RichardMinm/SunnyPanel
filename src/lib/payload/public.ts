import type { Where } from "payload";

import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadClient } from "@/lib/payload/client";

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
  const payload = await getPayloadClient();

  return payload.find({
    collection: "posts",
    depth: 1,
    limit: 24,
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

export const getPublicNotes = async () => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "notes",
    limit: 30,
    sort: "-createdAt",
    where: publicContentConstraint(),
  });
};

export const getPublicUpdates = async () => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "updates",
    limit: 30,
    sort: "-createdAt",
    where: publicContentConstraint(),
  });
};

export const getPublicTimelineEvents = async () => {
  const payload = await getPayloadClient();

  return payload.find({
    collection: "timeline-events",
    depth: 1,
    limit: 100,
    sort: "-eventDate",
    where: publicContentConstraint(),
  });
};
