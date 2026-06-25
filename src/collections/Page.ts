import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import {
  createSlugField,
  statusField,
  visibilityField,
} from "../lib/payload/fields.ts";
import { richContentFields } from "../lib/payload/rich-content-fields.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";
import { writingCategoryField } from "../lib/payload/writing-category-field.ts";

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
    ...withAdminNavGroup("content"),
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
      name: "summary",
      type: "textarea",
      label: "摘要",
      admin: {
        description: "可选。写一句摘要，便于在列表和预览中快速识别页面。",
        placeholder: "例如：这页主要介绍项目背景与联系方式。",
      },
    },
    ...richContentFields({
      label: "页面内容",
      legacyLabel: "旧 Markdown 页面内容",
    }),
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
    writingCategoryField,
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
