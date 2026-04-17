import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const Note: CollectionConfig = {
  slug: "notes",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["category", "mood", "status", "visibility", "updatedAt"],
    useAsTitle: "category",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "mood",
      type: "text",
    },
    {
      name: "category",
      type: "text",
      defaultValue: "note",
      required: true,
    },
    {
      name: "pinned",
      type: "checkbox",
      defaultValue: false,
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: "Notes",
    singular: "Note",
  },
};
