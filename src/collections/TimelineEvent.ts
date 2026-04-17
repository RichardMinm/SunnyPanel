import type { CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import { statusField, visibilityField } from "../lib/payload/fields.ts";

export const TimelineEvent: CollectionConfig = {
  slug: "timeline-events",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "type", "eventDate", "isFeatured", "status", "visibility"],
    useAsTitle: "title",
  },
  defaultSort: "-eventDate",
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
      name: "eventDate",
      type: "date",
      required: true,
    },
    {
      name: "type",
      type: "select",
      defaultValue: "milestone",
      options: [
        {
          label: "Milestone",
          value: "milestone",
        },
        {
          label: "Project",
          value: "project",
        },
        {
          label: "Life",
          value: "life",
        },
      ],
      required: true,
    },
    {
      name: "relatedPost",
      type: "relationship",
      relationTo: "posts",
    },
    {
      name: "relatedUpdate",
      type: "relationship",
      relationTo: "updates",
    },
    {
      name: "isFeatured",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
    },
    statusField,
    visibilityField(),
  ],
  labels: {
    plural: "Timeline Events",
    singular: "Timeline Event",
  },
};
