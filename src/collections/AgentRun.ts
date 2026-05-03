import type { CollectionAfterChangeHook, CollectionConfig } from "payload";

import type { Plan } from "@/payload-types";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

const runStatusToPlanAgentState: Record<string, NonNullable<Plan["agentState"]>> = {
  canceled: "ready",
  failed: "blocked",
  queued: "ready",
  running: "running",
  succeeded: "review",
};

const syncPlanAgentState: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.skipAgentRunPlanSync) {
    return doc;
  }

  const relatedPlan = doc.relatedPlan;
  const relatedPlanId =
    typeof relatedPlan === "number"
      ? relatedPlan
      : relatedPlan && typeof relatedPlan === "object" && "id" in relatedPlan
        ? relatedPlan.id
        : null;

  if (!relatedPlanId) {
    return doc;
  }

  await req.payload.update({
    collection: "plans",
    id: relatedPlanId,
    data: {
      agentState: runStatusToPlanAgentState[doc.status] ?? "idle",
      lastAgentRun: doc.id,
    },
    depth: 0,
    overrideAccess: true,
  });

  return doc;
};

export const AgentRun: CollectionConfig = {
  slug: "agent-runs",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "workflow", "status", "trigger", "startedAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-startedAt",
  fields: [
    {
      name: "title",
      type: "text",
      label: "运行标题",
      admin: {
        placeholder: "例如：Agent readiness audit / Weekly content planning",
      },
      required: true,
    },
    {
      name: "workflow",
      type: "select",
      label: "工作流类型",
      admin: {
        position: "sidebar",
      },
      defaultValue: "readiness-audit",
      options: [
        {
          label: "就绪检查",
          value: "readiness-audit",
        },
        {
          label: "计划拆解",
          value: "planning",
        },
        {
          label: "内容草拟",
          value: "content-draft",
        },
        {
          label: "发布审查",
          value: "publishing-review",
        },
        {
          label: "流程同步",
          value: "sync",
        },
        {
          label: "自动执行",
          value: "automation",
        },
      ],
      required: true,
    },
    {
      name: "status",
      type: "select",
      label: "运行状态",
      admin: {
        position: "sidebar",
      },
      defaultValue: "queued",
      options: [
        {
          label: "排队中",
          value: "queued",
        },
        {
          label: "运行中",
          value: "running",
        },
        {
          label: "已成功",
          value: "succeeded",
        },
        {
          label: "已失败",
          value: "failed",
        },
        {
          label: "已取消",
          value: "canceled",
        },
      ],
      required: true,
    },
    {
      name: "trigger",
      type: "select",
      label: "触发方式",
      admin: {
        position: "sidebar",
      },
      defaultValue: "manual",
      options: [
        {
          label: "手动触发",
          value: "manual",
        },
        {
          label: "定时触发",
          value: "scheduled",
        },
        {
          label: "Webhook",
          value: "webhook",
        },
        {
          label: "由 Agent 触发",
          value: "agent",
        },
      ],
      required: true,
    },
    {
      name: "goal",
      type: "textarea",
      label: "目标",
      admin: {
        description: "这次运行的目标、边界或验收标准。",
      },
    },
    {
      name: "summary",
      type: "textarea",
      label: "结果摘要",
      admin: {
        description: "用 1 到 3 句话说明这次运行完成了什么，留下了什么问题。",
      },
    },
    {
      name: "nextAction",
      type: "textarea",
      label: "下一步",
      admin: {
        description: "给下一次运行或人工接手留下可继续推进的动作。",
      },
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
      label: "关联内容",
      admin: {
        description: "把这次运行读写过的内容挂进来，便于后续审计。",
        position: "sidebar",
      },
      hasMany: true,
      relationTo: ["posts", "notes", "updates", "checklists", "timeline-events", "plan-reviews", "pages"],
    },
    {
      name: "startedAt",
      type: "date",
      label: "开始时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "completedAt",
      type: "date",
      label: "结束时间",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "durationMs",
      type: "number",
      label: "耗时（毫秒）",
      admin: {
        description: "可选。便于之后分析执行成本。",
        position: "sidebar",
      },
      min: 0,
    },
    {
      name: "steps",
      type: "array",
      label: "执行日志",
      admin: {
        description: "按时间顺序记录这次运行的关键步骤。",
        initCollapsed: false,
      },
      labels: {
        plural: "日志步骤",
        singular: "日志步骤",
      },
      fields: [
        {
          name: "recordedAt",
          type: "date",
          label: "记录时间",
        },
        {
          name: "level",
          type: "select",
          label: "级别",
          defaultValue: "info",
          options: [
            {
              label: "信息",
              value: "info",
            },
            {
              label: "警告",
              value: "warn",
            },
            {
              label: "错误",
              value: "error",
            },
          ],
          required: true,
        },
        {
          name: "message",
          type: "textarea",
          label: "内容",
          required: true,
        },
      ],
    },
  ],
  hooks: {
    afterChange: [syncPlanAgentState],
  },
  labels: {
    plural: {
      en: "Agent Runs",
      zh: "Agent 运行",
    },
    singular: {
      en: "Agent Run",
      zh: "Agent 运行",
    },
  },
};
