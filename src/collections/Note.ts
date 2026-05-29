import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";
import { markdownContentField } from "../lib/payload/markdown-fields.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

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
    ...withAdminNavGroup("content"),
    defaultColumns: ["category", "mood", "status", "visibility", "updatedAt"],
    useAsTitle: "category",
  },
  defaultSort: "-createdAt",
  fields: [
    markdownContentField({
      description: "支持 Markdown 短札写作。",
      label: "内容",
      toolbarMode: "minimal",
    }),
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
