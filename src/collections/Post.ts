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
      label: "标题",
      admin: {
        placeholder: "例如：把个人站点重新收成一个真正可持续更新的系统",
      },
      required: true,
    },
    createSlugField(),
    {
      name: "summary",
      type: "textarea",
      label: "摘要",
      admin: {
        description: "先写一句 1 到 2 行的摘要，后面可以再慢慢补。",
        placeholder: "例如：这篇文章主要记录这次改版的目标、选择和目前阶段结果。",
      },
      required: true,
    },
    {
      name: "content",
      type: "richText",
      label: "正文",
      admin: {
        description: "先把核心内容写下来，格式和细节可以之后再整理。",
      },
      required: true,
    },
    {
      name: "tags",
      type: "text",
      label: "标签",
      admin: {
        description: "可选。先不填也没关系。",
        position: "sidebar",
      },
      hasMany: true,
    },
    {
      name: "coverImage",
      type: "relationship",
      label: "封面图",
      admin: {
        position: "sidebar",
      },
      relationTo: "media",
    },
    statusField,
    publishedAtField,
    visibilityField(),
  ],
  labels: {
    plural: {
      en: "Posts",
      zh: "文章",
    },
    singular: {
      en: "Post",
      zh: "文章",
    },
  },
};
