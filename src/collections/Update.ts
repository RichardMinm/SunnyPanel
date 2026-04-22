import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Update: CollectionConfig = {
  slug: "updates",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["type", "status", "visibility", "updatedAt"],
    useAsTitle: "type",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "type",
      type: "select",
      label: "更新类型",
      admin: {
        description: "先选一个最接近的类型即可。",
        position: "sidebar",
      },
      defaultValue: "life",
      options: [
        {
          label: "生活",
          value: "life",
        },
        {
          label: "工作",
          value: "work",
        },
        {
          label: "项目",
          value: "project",
        },
      ],
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      label: "内容",
      admin: {
        placeholder: "例如：今天把首页收得更轻了，Dashboard 也开始更像真正工作台。",
      },
      required: true,
    },
    {
      name: "link",
      type: "text",
      label: "关联链接",
      admin: {
        description: "可选。需要时再补。",
        placeholder: "例如：https://...",
        position: "sidebar",
      },
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
      en: "Updates",
      zh: "更新",
    },
    singular: {
      en: "Update",
      zh: "更新",
    },
  },
};
