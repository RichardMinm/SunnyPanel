import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Plan: CollectionConfig = {
  slug: "plans",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "priority", "status", "dueDate", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "dueDate",
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    statusField,
    {
      name: "priority",
      type: "select",
      defaultValue: "medium",
      options: [
        {
          label: "Low",
          value: "low",
        },
        {
          label: "Medium",
          value: "medium",
        },
        {
          label: "High",
          value: "high",
        },
      ],
      required: true,
    },
    {
      name: "startDate",
      type: "date",
    },
    {
      name: "dueDate",
      type: "date",
    },
    visibilityField("private"),
  ],
  labels: {
    plural: "Plans",
    singular: "Plan",
  },
};
