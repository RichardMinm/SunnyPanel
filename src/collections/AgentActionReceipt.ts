import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const AgentActionReceipt: CollectionConfig = {
  slug: "agent-action-receipts",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("agent"),
    defaultColumns: ["key", "intent", "status", "updatedAt"],
    useAsTitle: "key",
  },
  fields: [
    {
      name: "key",
      type: "text",
      index: true,
      required: true,
      unique: true,
    },
    {
      name: "actionId",
      type: "text",
      index: true,
      required: true,
    },
    {
      name: "intent",
      type: "text",
      required: true,
    },
    {
      name: "operation",
      type: "select",
      defaultValue: "execute",
      options: [
        { label: "执行", value: "execute" },
        { label: "回滚", value: "rollback" },
      ],
      required: true,
    },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      options: [
        { label: "执行中", value: "pending" },
        { label: "已成功", value: "succeeded" },
        { label: "失败", value: "failed" },
        { label: "状态不确定", value: "indeterminate" },
      ],
      required: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "thread",
      type: "relationship",
      relationTo: "agent-threads",
      required: true,
    },
    {
      name: "response",
      type: "json",
    },
    {
      name: "rollbackPayload",
      type: "json",
    },
    {
      name: "error",
      type: "textarea",
    },
    {
      name: "completedAt",
      type: "date",
    },
  ],
};
