import path from "node:path";

import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublicMedia, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublicMedia,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("content"),
    defaultColumns: ["filename", "alt", "visibility", "updatedAt"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "替代文本 / 文件说明",
      admin: {
        description: "图片请简述画面；其他文件请填写便于识别的说明。",
      },
      required: true,
    },
    {
      name: "visibility",
      type: "select",
      label: "访问范围",
      admin: {
        description: "新上传文件默认仅后台可见；只有明确设为公开后，匿名访客才能读取。",
        position: "sidebar",
      },
      defaultValue: "private",
      index: true,
      options: [
        { label: "私有", value: "private" },
        { label: "公开", value: "public" },
      ],
      required: true,
    },
  ],
  upload: {
    staticDir: path.resolve(process.cwd(), "media"),
    focalPoint: true,
    imageSizes: [
      {
        name: "card",
        width: 960,
        height: 640,
      },
      {
        name: "thumbnail",
        width: 480,
        height: 320,
      },
    ],
    mimeTypes: [
      "image/*",
      "video/mp4",
      "video/webm",
      "application/pdf",
      "application/zip",
      "text/plain",
      "text/markdown",
      "text/csv",
    ],
  },
  labels: {
    plural: {
      en: "Media",
      zh: "媒体",
    },
    singular: {
      en: "Media",
      zh: "媒体",
    },
  },
};
