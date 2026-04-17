import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import {
  createSlugField,
  publishedAtField,
  statusField,
  visibilityField,
} from "../lib/payload/fields.ts";

export const Post: CollectionConfig = {
  slug: "posts",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "status", "visibility", "publishedAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-publishedAt",
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    createSlugField(),
    {
      name: "summary",
      type: "textarea",
      required: true,
    },
    {
      name: "content",
      type: "richText",
      required: true,
    },
    {
      name: "tags",
      type: "text",
      hasMany: true,
    },
    {
      name: "coverImage",
      type: "relationship",
      relationTo: "media",
    },
    statusField,
    publishedAtField,
    visibilityField(),
  ],
  labels: {
    plural: "Posts",
    singular: "Post",
  },
};
