import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Update: CollectionConfig = {
  slug: "updates",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["type", "status", "visibility", "updatedAt"],
    useAsTitle: "type",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "type",
      type: "select",
      defaultValue: "life",
      options: [
        {
          label: "Life",
          value: "life",
        },
        {
          label: "Work",
          value: "work",
        },
        {
          label: "Project",
          value: "project",
        },
      ],
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "link",
      type: "text",
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: {
      en: "Updates",
      zh: "更新",
    },
    singular: {
      en: "Update",
      zh: "更新",
    },
  },
};
