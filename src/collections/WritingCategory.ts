import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const WritingCategory: CollectionConfig = {
  slug: "writing-categories",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("content"),
    defaultColumns: ["title", "icon", "tint", "archived", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "sortOrder",
  fields: [
    {
      name: "title",
      type: "text",
      label: "名称",
      required: true,
    },
    {
      name: "icon",
      type: "select",
      defaultValue: "layers",
      label: "图标",
      options: [
        { label: "文章", value: "post" },
        { label: "短札", value: "note" },
        { label: "动态", value: "sparkle" },
        { label: "页面", value: "document" },
        { label: "写作", value: "pencil" },
        { label: "集合", value: "layers" },
        { label: "归档", value: "archive" },
      ],
      required: true,
    },
    {
      name: "tint",
      type: "select",
      defaultValue: "accent",
      label: "颜色",
      options: [
        { label: "强调", value: "accent" },
        { label: "信息", value: "info" },
        { label: "警示", value: "warning" },
        { label: "成功", value: "success" },
        { label: "中性", value: "muted" },
      ],
      required: true,
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
      label: "排序",
    },
    {
      name: "parent",
      type: "relationship",
      label: "上级文档集",
      relationTo: "writing-categories",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "archived",
      type: "checkbox",
      defaultValue: false,
      label: "已归档",
    },
  ],
  labels: {
    plural: {
      en: "Writing Categories",
      zh: "文档集",
    },
    singular: {
      en: "Writing Category",
      zh: "文档集",
    },
  },
};
