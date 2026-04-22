import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const TimelineEvent: CollectionConfig = {
  slug: "timeline-events",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "type", "eventDate", "isFeatured", "status", "visibility"],
    useAsTitle: "title",
  },
  defaultSort: "-eventDate",
  fields: [
    {
      name: "title",
      type: "text",
      label: "节点标题",
      admin: {
        placeholder: "例如：SunnyPanel 完成第一版私有工作台",
      },
      required: true,
    },
    {
      name: "description",
      type: "textarea",
      label: "说明",
      admin: {
        placeholder: "可选：补一句这个节点为什么重要。",
      },
    },
    {
      name: "eventDate",
      type: "date",
      label: "发生时间",
      admin: {
        description: "记录这个节点真正发生的时间。",
        position: "sidebar",
      },
      required: true,
    },
    {
      name: "type",
      type: "select",
      label: "节点类型",
      admin: {
        position: "sidebar",
      },
      defaultValue: "milestone",
      options: [
        {
          label: "里程碑",
          value: "milestone",
        },
        {
          label: "项目",
          value: "project",
        },
        {
          label: "生活",
          value: "life",
        },
      ],
      required: true,
    },
    {
      name: "relatedPost",
      type: "relationship",
      label: "关联文章",
      admin: {
        position: "sidebar",
      },
      relationTo: "posts",
    },
    {
      name: "relatedUpdate",
      type: "relationship",
      label: "关联更新",
      admin: {
        position: "sidebar",
      },
      relationTo: "updates",
    },
    {
      name: "relatedChecklist",
      type: "relationship",
      label: "关联清单",
      admin: {
        position: "sidebar",
      },
      relationTo: "checklists",
    },
    {
      name: "relatedTaskKey",
      type: "text",
      label: "内部任务标识",
      admin: {
        description: "系统内部使用，用来避免重复生成完成记录。",
        readOnly: true,
      },
    },
    {
      name: "isFeatured",
      type: "checkbox",
      label: "设为精选",
      admin: {
        position: "sidebar",
      },
      defaultValue: false,
    },
    {
      name: "sortOrder",
      type: "number",
      label: "排序权重",
      admin: {
        position: "sidebar",
      },
      defaultValue: 0,
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: {
      en: "Timeline Events",
      zh: "时间线",
    },
    singular: {
      en: "Timeline Event",
      zh: "时间节点",
    },
  },
};
