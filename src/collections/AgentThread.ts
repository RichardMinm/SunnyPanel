import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

export const AgentThread: CollectionConfig = {
  slug: "agent-threads",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "status", "lastIntent", "lastEngine", "lastInteractionAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-lastInteractionAt",
  fields: [
    {
      name: "title",
      type: "text",
      label: "会话标题",
      defaultValue: "Agent Thread",
      required: true,
    },
    {
      name: "status",
      type: "select",
      label: "会话状态",
      admin: {
        position: "sidebar",
      },
      defaultValue: "active",
      options: [
        {
          label: "进行中",
          value: "active",
        },
        {
          label: "已关闭",
          value: "closed",
        },
      ],
      required: true,
    },
    {
      name: "user",
      type: "relationship",
      label: "关联用户",
      admin: {
        position: "sidebar",
      },
      relationTo: "users",
      required: true,
    },
    {
      name: "messages",
      type: "array",
      label: "消息历史",
      admin: {
        description: "保留最近的对话上下文，供事务型 Agent 继续承接。",
        initCollapsed: true,
      },
      fields: [
        {
          name: "role",
          type: "select",
          label: "角色",
          options: [
            {
              label: "用户",
              value: "user",
            },
            {
              label: "Agent",
              value: "assistant",
            },
          ],
          required: true,
        },
        {
          name: "content",
          type: "textarea",
          label: "内容",
          required: true,
        },
        {
          name: "recordedAt",
          type: "date",
          label: "记录时间",
        },
      ],
    },
    {
      name: "pendingAction",
      type: "json",
      label: "待处理动作",
      admin: {
        description: "例如等待用户补 completion note。写入前由 Agent schema 校验。",
      },
    },
    {
      name: "lastIntent",
      type: "select",
      label: "最近意图",
      admin: {
        position: "sidebar",
      },
      options: [
        {
          label: "创建计划",
          value: "create_plan",
        },
        {
          label: "补充计划项",
          value: "append_plan_item",
        },
        {
          label: "标记完成",
          value: "complete_plan_item",
        },
        {
          label: "补完成备注",
          value: "add_completion_note",
        },
        {
          label: "查询进度",
          value: "query_progress",
        },
        {
          label: "评估计划",
          value: "evaluate_plan",
        },
        {
          label: "追问澄清",
          value: "clarify",
        },
      ],
    },
    {
      name: "lastEngine",
      type: "select",
      label: "最近解析引擎",
      admin: {
        position: "sidebar",
      },
      options: [
        {
          label: "GLM",
          value: "glm",
        },
        {
          label: "规则",
          value: "heuristic",
        },
        {
          label: "流程接力",
          value: "workflow",
        },
      ],
    },
    {
      name: "lastConfidence",
      type: "number",
      label: "最近置信度",
      admin: {
        position: "sidebar",
      },
      max: 1,
      min: 0,
    },
    {
      name: "lastInteractionAt",
      type: "date",
      label: "最近交互时间",
      admin: {
        position: "sidebar",
      },
    },
  ],
  labels: {
    plural: {
      en: "Agent Threads",
      zh: "Agent 会话",
    },
    singular: {
      en: "Agent Thread",
      zh: "Agent 会话",
    },
  },
};
