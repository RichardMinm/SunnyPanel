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
      admin: {
        placeholder: "直接写下这条短札想记录的内容。",
      },
      required: true,
    },
    {
      name: "mood",
      type: "text",
      label: "心情 / 氛围",
      admin: {
        placeholder: "可选，例如：平静、兴奋、卡住了。",
        position: "sidebar",
      },
    },
    {
      name: "category",
      type: "text",
      label: "分类",
      admin: {
        placeholder: "例如：note、idea、reading",
      },
      defaultValue: "note",
      required: true,
    },
    {
      name: "pinned",
      type: "checkbox",
      label: "置顶",
      admin: {
        position: "sidebar",
      },
      defaultValue: false,
    },
    {
      name: "coverImage",
      type: "relationship",
      label: "配图",
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
      en: "Notes",
      zh: "短札",
    },
    singular: {
      en: "Note",
      zh: "短札",
    },
  },
};
