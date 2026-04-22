import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import {
  createSlugField,
  statusField,
  visibilityField,
} from "../lib/payload/fields.ts";

export const Page: CollectionConfig = {
  slug: "pages",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "status", "visibility", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "title",
  fields: [
    {
      name: "title",
      type: "text",
      label: "页面标题",
      admin: {
        placeholder: "例如：About、Now、Uses",
      },
      required: true,
    },
    createSlugField(),
    {
      name: "content",
      type: "richText",
      label: "页面内容",
      admin: {
        description: "先把页面的核心内容写出来，版式可以之后再慢慢调整。",
      },
      required: true,
    },
    {
      name: "coverImage",
      type: "relationship",
      label: "头图",
      admin: {
        position: "sidebar",
      },
      relationTo: "media",
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: {
      en: "Pages",
      zh: "页面",
    },
    singular: {
      en: "Page",
      zh: "页面",
    },
  },
};
