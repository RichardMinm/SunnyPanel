import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

export const PlanReview: CollectionConfig = {
  slug: "plan-reviews",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "scope", "health", "plan", "reviewedAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-reviewedAt",
  fields: [
    {
      name: "title",
      type: "text",
      label: "回顾标题",
      required: true,
    },
    {
      name: "scope",
      type: "select",
      label: "回顾范围",
      admin: {
        position: "sidebar",
      },
      defaultValue: "overall",
      options: [
        {
          label: "整体计划",
          value: "overall",
        },
        {
          label: "单项计划",
          value: "plan",
        },
      ],
      required: true,
    },
    {
      name: "health",
      type: "select",
      label: "健康度",
      admin: {
        position: "sidebar",
      },
      defaultValue: "attention",
      options: [
        {
          label: "健康",
          value: "healthy",
        },
        {
          label: "需关注",
          value: "attention",
        },
        {
          label: "有风险",
          value: "risk",
        },
      ],
      required: true,
    },
    {
      name: "plan",
      type: "relationship",
      label: "关联计划",
      admin: {
        condition: (_, siblingData) => siblingData?.scope === "plan",
        position: "sidebar",
      },
      relationTo: "plans",
    },
    {
      name: "summary",
      type: "textarea",
      label: "回顾摘要",
      required: true,
    },
    {
      name: "metrics",
      type: "json",
      label: "真实指标",
      admin: {
        description: "由 Agent 根据 Plan / Checklist / Timeline / AgentRun 等真实数据生成。",
      },
    },
    {
      name: "recommendations",
      type: "array",
      label: "建议卡片",
      admin: {
        initCollapsed: false,
      },
      fields: [
        {
          name: "content",
          type: "textarea",
          label: "建议",
          required: true,
        },
      ],
    },
    {
      name: "source",
      type: "select",
      label: "来源",
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
          label: "人工",
          value: "manual",
        },
      ],
      required: true,
    },
    {
      name: "reviewedAt",
      type: "date",
      label: "回顾时间",
      admin: {
        position: "sidebar",
      },
      required: true,
    },
  ],
  labels: {
    plural: {
      en: "Plan Reviews",
      zh: "计划回顾",
    },
    singular: {
      en: "Plan Review",
      zh: "计划回顾",
    },
  },
};
