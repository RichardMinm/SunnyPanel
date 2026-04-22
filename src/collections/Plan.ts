import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Plan: CollectionConfig = {
  slug: "plans",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "state", "priority", "status", "dueDate", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "dueDate",
  fields: [
    {
      name: "title",
      type: "text",
      label: "计划标题",
      admin: {
        placeholder: "例如：完成高数第一章复习，或补完 SunnyPanel 的工作台体验",
      },
      required: true,
    },
    {
      name: "description",
      type: "textarea",
      label: "说明",
      admin: {
        placeholder: "可选：先记一句这项计划要达到什么结果。",
      },
    },
    {
      name: "linkedContent",
      type: "relationship",
      label: "关联内容",
      admin: {
        description: "把这项计划正在产出的文章、短札、更新、清单、时间线节点或页面关联进来。",
        position: "sidebar",
      },
      hasMany: true,
      relationTo: ["posts", "notes", "updates", "checklists", "timeline-events", "pages"],
    },
    {
      name: "state",
      type: "select",
      label: "推进状态",
      defaultValue: "backlog",
      options: [
        {
          label: "待开始",
          value: "backlog",
        },
        {
          label: "进行中",
          value: "active",
        },
        {
          label: "暂停中",
          value: "paused",
        },
        {
          label: "已完成",
          value: "done",
        },
      ],
      required: true,
    },
    statusField,
    {
      name: "priority",
      type: "select",
      label: "优先级",
      defaultValue: "medium",
      options: [
        {
          label: "低",
          value: "low",
        },
        {
          label: "中",
          value: "medium",
        },
        {
          label: "高",
          value: "high",
        },
      ],
      required: true,
    },
    {
      name: "startDate",
      type: "date",
      label: "开始时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "dueDate",
      type: "date",
      label: "截止时间",
      admin: {
        position: "sidebar",
      },
    },
    visibilityField("private"),
  ],
  labels: {
    plural: {
      en: "Plans",
      zh: "计划",
    },
    singular: {
      en: "Plan",
      zh: "计划",
    },
  },
};
