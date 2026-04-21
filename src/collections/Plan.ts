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
    defaultColumns: ["title", "state", "priority", "status", "dueDate", "updatedAt"],
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
    {
      name: "linkedContent",
      type: "relationship",
      admin: {
        description: "Attach the posts, notes, updates, checklists, timeline events, or pages that this plan is producing.",
      },
      hasMany: true,
      relationTo: ["posts", "notes", "updates", "checklists", "timeline-events", "pages"],
    },
    {
      name: "state",
      type: "select",
      defaultValue: "backlog",
      options: [
        {
          label: "Backlog",
          value: "backlog",
        },
        {
          label: "Active",
          value: "active",
        },
        {
          label: "Paused",
          value: "paused",
        },
        {
          label: "Done",
          value: "done",
        },
      ],
      required: true,
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
