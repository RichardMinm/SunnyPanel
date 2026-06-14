import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

const timePattern = "^([01][0-9]|2[0-3]):[0-5][0-9]$";

export const ScheduleItem: CollectionConfig = {
  slug: "schedule-items",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("planning"),
    defaultColumns: ["title", "date", "startTime", "endTime", "status", "priority", "sourceType"],
    useAsTitle: "title",
  },
  defaultSort: "date",
  fields: [
    {
      name: "title",
      type: "text",
      label: "日程标题",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
      label: "说明",
    },
    {
      name: "date",
      type: "date",
      label: "日期",
      required: true,
    },
    {
      name: "startTime",
      type: "text",
      label: "开始时间",
      admin: {
        description: "使用 HH:mm，例如 09:30。全天事项可留空。",
        placeholder: "09:00",
      },
      validate: (value: unknown) => {
        if (!value) {
          return true;
        }

        return typeof value === "string" && new RegExp(timePattern).test(value)
          ? true
          : "请使用 HH:mm 时间格式。";
      },
    },
    {
      name: "endTime",
      type: "text",
      label: "结束时间",
      admin: {
        description: "使用 HH:mm，例如 10:30。全天事项可留空。",
        placeholder: "10:30",
      },
      validate: (value: unknown) => {
        if (!value) {
          return true;
        }

        return typeof value === "string" && new RegExp(timePattern).test(value)
          ? true
          : "请使用 HH:mm 时间格式。";
      },
    },
    {
      name: "isAllDay",
      type: "checkbox",
      label: "全天事项",
      defaultValue: false,
    },
    {
      name: "status",
      type: "select",
      label: "状态",
      defaultValue: "planned",
      options: [
        { label: "计划中", value: "planned" },
        { label: "已完成", value: "done" },
        { label: "已跳过", value: "skipped" },
        { label: "已取消", value: "canceled" },
      ],
      required: true,
    },
    {
      name: "priority",
      type: "select",
      label: "优先级",
      defaultValue: "medium",
      options: [
        { label: "低", value: "low" },
        { label: "中", value: "medium" },
        { label: "高", value: "high" },
      ],
      required: true,
    },
    {
      name: "sourceType",
      type: "select",
      label: "来源",
      defaultValue: "manual",
      options: [
        { label: "计划", value: "plan" },
        { label: "清单", value: "checklist" },
        { label: "手动", value: "manual" },
        { label: "Agent", value: "agent" },
      ],
      required: true,
    },
    {
      name: "category",
      type: "select",
      label: "分类",
      defaultValue: "default",
      options: [
        { label: "课程", value: "course" },
        { label: "学习", value: "study" },
        { label: "计划动作", value: "plan_action" },
        { label: "Agent 生成", value: "agent" },
        { label: "考试 / 截止", value: "exam" },
        { label: "默认", value: "default" },
      ],
    },
    {
      name: "relatedPlan",
      type: "relationship",
      label: "关联计划",
      relationTo: "plans",
    },
    {
      name: "relatedChecklist",
      type: "relationship",
      label: "关联清单",
      relationTo: "checklists",
    },
    {
      name: "relatedChecklistItemKey",
      type: "text",
      label: "关联清单条目 Key",
    },
    {
      name: "agentBrief",
      type: "textarea",
      label: "Agent Brief",
    },
    {
      name: "createdBy",
      type: "select",
      label: "创建者",
      defaultValue: "manual",
      options: [
        { label: "手动", value: "manual" },
        { label: "Agent", value: "agent" },
      ],
      required: true,
    },
    {
      name: "conflictNote",
      type: "textarea",
      label: "冲突备注",
    },
  ],
  labels: {
    plural: {
      en: "Schedule Items",
      zh: "日程",
    },
    singular: {
      en: "Schedule Item",
      zh: "日程",
    },
  },
};
