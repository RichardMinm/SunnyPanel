import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const AgentMemory: CollectionConfig = {
  slug: "agent-memories",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("agent"),
    defaultColumns: ["title", "type", "confidence", "status", "lastUsedAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-lastUsedAt",
  fields: [
    {
      name: "title",
      type: "text",
      label: "记忆标题",
      required: true,
    },
    {
      name: "type",
      type: "select",
      label: "记忆类型",
      admin: {
        position: "sidebar",
      },
      defaultValue: "fact",
      options: [
        {
          label: "偏好",
          value: "preference",
        },
        {
          label: "项目上下文",
          value: "project_context",
        },
        {
          label: "写作风格",
          value: "writing_style",
        },
        {
          label: "工作流规则",
          value: "workflow_rule",
        },
        {
          label: "事实",
          value: "fact",
        },
      ],
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      label: "记忆内容",
      required: true,
    },
    {
      name: "embedding",
      type: "json",
      label: "向量嵌入",
      admin: {
        description: "语义检索用 embedding（number[]）。由 Agent 在保存记忆时自动写入。",
        position: "sidebar",
      },
    },
    {
      name: "confidence",
      type: "number",
      label: "置信度",
      admin: {
        position: "sidebar",
        step: 0.05,
      },
      defaultValue: 0.7,
      max: 1,
      min: 0,
      required: true,
    },
    {
      name: "sourceThread",
      type: "relationship",
      label: "来源会话",
      admin: {
        position: "sidebar",
      },
      relationTo: "agent-threads",
    },
    {
      name: "sourceRun",
      type: "relationship",
      label: "来源运行",
      admin: {
        position: "sidebar",
      },
      relationTo: "agent-runs",
    },
    {
      name: "lastUsedAt",
      type: "date",
      label: "最近使用时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "status",
      type: "select",
      label: "状态",
      admin: {
        position: "sidebar",
      },
      defaultValue: "active",
      options: [
        {
          label: "生效中",
          value: "active",
        },
        {
          label: "已归档",
          value: "archived",
        },
      ],
      required: true,
    },
    {
      name: "visibility",
      type: "select",
      label: "可见性",
      admin: {
        description: "AgentMemory 只用于单用户私有工作台，暂不允许公开。",
        position: "sidebar",
      },
      defaultValue: "private",
      options: [
        {
          label: "私有",
          value: "private",
        },
      ],
      required: true,
    },
  ],
  labels: {
    plural: {
      en: "Agent Memories",
      zh: "Agent 长期记忆",
    },
    singular: {
      en: "Agent Memory",
      zh: "Agent 长期记忆",
    },
  },
};
