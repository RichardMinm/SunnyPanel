import type { GlobalConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "@/lib/payload/access";

export const AgentSettings: GlobalConfig = {
  slug: "agent-settings",
  access: {
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    group: {
      en: "System",
      zh: "系统",
    },
    hidden: ({ user }) => !canAccessAdmin({ req: { user } as never }),
  },
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      label: "启用后台 Agent 配置",
      defaultValue: true,
      admin: {
        description: "关闭后，系统会直接回退到环境变量里的模型配置。",
      },
    },
    {
      name: "provider",
      type: "select",
      label: "提供方",
      defaultValue: "openai-compatible",
      options: [
        {
          label: "OpenAI Compatible",
          value: "openai-compatible",
        },
        {
          label: "OpenAI",
          value: "openai",
        },
        {
          label: "GLM / ZAI",
          value: "zai",
        },
      ],
      required: true,
    },
    {
      name: "baseUrl",
      type: "text",
      label: "Base URL",
      admin: {
        description: "例如 OpenAI 官方接口，或 GLM 的 OpenAI-compatible 地址。",
        placeholder: "https://api.openai.com/v1",
      },
    },
    {
      name: "model",
      type: "text",
      label: "模型名",
      admin: {
        description: "例如 `gpt-5.4-mini`、`gpt-4.1-mini`、`glm-5.1`。",
        placeholder: "gpt-5.4-mini",
      },
    },
    {
      name: "apiKey",
      type: "text",
      label: "API Key",
      admin: {
        description: "留空时会回退到环境变量；只有管理员能在后台看到和修改这项配置。",
        placeholder: "sk-...",
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "备注",
      admin: {
        description: "可选。记录这组模型配置的用途，例如“Agent MVP / 实验用”。",
      },
    },
  ],
  label: {
    en: "Agent Settings",
    zh: "Agent 设置",
  },
};
