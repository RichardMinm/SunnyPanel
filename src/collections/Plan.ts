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
    defaultColumns: ["title", "state", "agentState", "priority", "status", "dueDate", "updatedAt"],
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
      name: "executionMode",
      type: "select",
      label: "执行模式",
      admin: {
        description: "为未来接入自动 Agent 预留：这项计划主要由谁推进。",
        position: "sidebar",
      },
      defaultValue: "manual",
      options: [
        {
          label: "人工",
          value: "manual",
        },
        {
          label: "人工 + Agent",
          value: "hybrid",
        },
        {
          label: "以 Agent 为主",
          value: "agent",
        },
      ],
      required: true,
    },
    {
      name: "agentState",
      type: "select",
      label: "Agent 状态",
      admin: {
        description: "这项计划在 Agent 工作流里的当前阶段。",
        position: "sidebar",
      },
      defaultValue: "idle",
      options: [
        {
          label: "空闲",
          value: "idle",
        },
        {
          label: "可执行",
          value: "ready",
        },
        {
          label: "运行中",
          value: "running",
        },
        {
          label: "阻塞",
          value: "blocked",
        },
        {
          label: "待复核",
          value: "review",
        },
      ],
      required: true,
    },
    {
      name: "agentBrief",
      type: "textarea",
      label: "Agent Brief",
      admin: {
        description: "给未来 Agent 的目标、边界、输入和完成标准。",
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
      name: "lastAgentRun",
      type: "relationship",
      label: "最近一次 Agent Run",
      admin: {
        description: "通常由 Agent Run 自动回写，用来追踪最近一次执行记录。",
        position: "sidebar",
      },
      relationTo: "agent-runs",
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
