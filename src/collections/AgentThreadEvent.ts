import type { CollectionConfig } from "payload";

import {
  adminsOnly,
  canAccessAdmin,
} from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const AgentThreadEvent: CollectionConfig = {
  slug: "agent-thread-events",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: () => false,
  },
  admin: {
    ...withAdminNavGroup("agent"),
    defaultColumns: [
      "eventType",
      "turnId",
      "thread",
      "recordedAt",
    ],
    useAsTitle: "eventKey",
  },
  defaultSort: "id",
  fields: [
    {
      name: "eventKey",
      type: "text",
      index: true,
      required: true,
      unique: true,
    },
    {
      name: "turnId",
      type: "text",
      index: true,
      required: true,
    },
    {
      name: "eventType",
      type: "select",
      index: true,
      options: [
        {
          label: "旧线程导入",
          value: "legacy_bootstrap",
        },
        {
          label: "收到用户输入",
          value: "user_received",
        },
        {
          label: "助手回合完成",
          value: "assistant_completed",
        },
        {
          label: "回合失败",
          value: "turn_failed",
        },
        {
          label: "投影失败",
          value: "projection_failed",
        },
      ],
      required: true,
    },
    {
      name: "schemaVersion",
      type: "number",
      defaultValue: 1,
      min: 1,
      required: true,
    },
    {
      name: "thread",
      type: "relationship",
      index: true,
      relationTo: "agent-threads",
      required: true,
    },
    {
      name: "user",
      type: "relationship",
      index: true,
      relationTo: "users",
      required: true,
    },
    {
      name: "payload",
      type: "json",
      required: true,
    },
    {
      name: "recordedAt",
      type: "date",
      index: true,
      required: true,
    },
  ],
};
