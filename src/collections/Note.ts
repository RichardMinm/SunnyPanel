import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Note: CollectionConfig = {
  slug: "notes",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["category", "mood", "status", "visibility", "updatedAt"],
    useAsTitle: "category",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "content",
      type: "textarea",
      label: "内容",
      required: true,
    },
    {
      name: "mood",
      type: "text",
      label: "心情 / 氛围",
    },
    {
      name: "category",
      type: "text",
      label: "分类",
      defaultValue: "note",
      required: true,
    },
    {
      name: "pinned",
      type: "checkbox",
      label: "置顶",
      defaultValue: false,
    },
    {
      name: "coverImage",
      type: "relationship",
      label: "配图",
      relationTo: "media",
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: {
      en: "Notes",
      zh: "短札",
    },
    singular: {
      en: "Note",
      zh: "短札",
    },
  },
};
