import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

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
    ...withAdminNavGroup("agent"),
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
      name: "summary",
      type: "textarea",
      label: "线程摘要",
      admin: {
        description: "自动压缩长会话，供 Agent 在不读取完整消息历史时继续承接目标、结果和待处理动作。",
      },
    },
    {
      name: "summaryUpdatedAt",
      type: "date",
      label: "摘要更新时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "summaryMessageCount",
      type: "number",
      label: "摘要覆盖消息数",
      admin: {
        position: "sidebar",
      },
      min: 0,
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
          label: "回答问题",
          value: "answer_question",
        },
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
          label: "生成完整计划",
          value: "compose_plan",
        },
        {
          label: "生成日程",
          value: "compose_schedule_item",
        },
        {
          label: "生成时间线节点",
          value: "compose_timeline_event",
        },
        {
          label: "补完成备注",
          value: "add_completion_note",
        },
        {
          label: "保存长期记忆",
          value: "save_memory",
        },
        {
          label: "查询进度",
          value: "query_progress",
        },
        {
          label: "查询计划进度",
          value: "query_plan_progress",
        },
        {
          label: "评估计划",
          value: "evaluate_plan",
        },
        {
          label: "计划排期",
          value: "schedule_plan",
        },
        {
          label: "本周回顾",
          value: "weekly_review",
        },
        {
          label: "改期日程",
          value: "reschedule_item",
        },
        {
          label: "取消日程",
          value: "cancel_schedule_item",
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
          label: "OpenAI",
          value: "openai",
        },
        {
          label: "Z.ai",
          value: "zai",
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
    {
      name: "tags",
      type: "json",
      label: "标签",
      admin: {
        position: "sidebar",
        description: "JSON 字符串数组，用于分类检索。",
      },
    },
    {
      name: "archived",
      type: "checkbox",
      label: "已归档",
      defaultValue: false,
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
