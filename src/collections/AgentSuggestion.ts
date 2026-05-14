import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

export const AgentSuggestion: CollectionConfig = {
  slug: "agent-suggestions",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "source", "riskLevel", "status", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-updatedAt",
  fields: [
    {
      name: "title",
      type: "text",
      label: "建议标题",
      required: true,
    },
    {
      name: "reason",
      type: "textarea",
      label: "建议原因",
      required: true,
    },
    {
      name: "suggestedPrompt",
      type: "textarea",
      label: "建议提示词",
      required: true,
    },
    {
      name: "uniqueKey",
      type: "text",
      label: "去重键",
      admin: {
        description: "由 Agent 生成，用于避免同一条建议反复出现。",
        position: "sidebar",
      },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: "source",
      type: "select",
      label: "来源",
      admin: {
        position: "sidebar",
      },
      defaultValue: "dashboard",
      options: [
        {
          label: "Dashboard",
          value: "dashboard",
        },
        {
          label: "Plan",
          value: "plan",
        },
        {
          label: "Content",
          value: "content",
        },
        {
          label: "Timeline",
          value: "timeline",
        },
        {
          label: "Agent Run",
          value: "agent-run",
        },
        {
          label: "Review",
          value: "review",
        },
      ],
      required: true,
    },
    {
      name: "riskLevel",
      type: "select",
      label: "风险等级",
      admin: {
        position: "sidebar",
      },
      defaultValue: "low",
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
      name: "status",
      type: "select",
      label: "状态",
      admin: {
        position: "sidebar",
      },
      defaultValue: "pending",
      options: [
        {
          label: "待处理",
          value: "pending",
        },
        {
          label: "已接受",
          value: "accepted",
        },
        {
          label: "已忽略",
          value: "dismissed",
        },
        {
          label: "已完成",
          value: "done",
        },
      ],
      required: true,
    },
    {
      name: "relatedPlan",
      type: "relationship",
      label: "关联计划",
      admin: {
        position: "sidebar",
      },
      relationTo: "plans",
    },
    {
      name: "relatedContent",
      type: "relationship",
      hasMany: true,
      label: "关联内容",
      relationTo: ["posts", "notes", "updates", "checklists", "timeline-events", "pages"],
    },
    {
      name: "createdBy",
      type: "select",
      label: "创建者",
      admin: {
        position: "sidebar",
      },
      defaultValue: "agent",
      options: [
        {
          label: "Agent",
          value: "agent",
        },
        {
          label: "Manual",
          value: "manual",
        },
      ],
      required: true,
    },
    {
      name: "dismissedAt",
      type: "date",
      label: "忽略时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "acceptedAt",
      type: "date",
      label: "接受时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "completedAt",
      type: "date",
      label: "完成时间",
      admin: {
        position: "sidebar",
      },
    },
  ],
  labels: {
    plural: {
      en: "Agent Suggestions",
      zh: "Agent 建议",
    },
    singular: {
      en: "Agent Suggestion",
      zh: "Agent 建议",
    },
  },
};
