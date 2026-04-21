import type { CollectionAfterChangeHook, CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access.ts";
import {
  createSlugField,
  publishedAtField,
  statusField,
  visibilityField,
} from "../lib/payload/fields.ts";

type ChecklistItem = {
  completedAt?: null | string;
  completionNote?: null | string;
  description?: null | string;
  id?: string;
  isCompleted?: boolean;
  title?: string;
};

type ChecklistGroup = {
  id?: string;
  items?: ChecklistItem[];
  title?: string;
};

type ChecklistDocument = {
  id: number;
  status: "draft" | "published";
  title: string;
  visibility: "private" | "public";
  groups?: ChecklistGroup[];
};

const findCompletedItemById = (groups: ChecklistDocument["groups"], itemId?: string) => {
  if (!itemId) {
    return null;
  }

  for (const group of groups ?? []) {
    for (const item of group.items ?? []) {
      if (item.id === itemId) {
        return item;
      }
    }
  }

  return null;
};

const syncChecklistCompletionsToTimeline: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const checklist = doc as ChecklistDocument;
  const previousChecklist = (previousDoc ?? null) as ChecklistDocument | null;

  for (const group of checklist.groups ?? []) {
    for (const item of group.items ?? []) {
      if (!item.isCompleted || !item.id || !item.title) {
        continue;
      }

      const previousItem = findCompletedItemById(previousChecklist?.groups, item.id);

      if (previousItem?.isCompleted) {
        continue;
      }

      const existingEvent = await req.payload.find({
        collection: "timeline-events",
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: {
          and: [
            {
              relatedChecklist: {
                equals: checklist.id,
              },
            },
            {
              relatedTaskKey: {
                equals: item.id,
              },
            },
          ],
        },
      });

      if (existingEvent.totalDocs > 0) {
        continue;
      }

      const eventTitle = group.title
        ? `${checklist.title} · ${group.title} / ${item.title} 完成`
        : `${checklist.title} · ${item.title} 完成`;
      const descriptionParts = [item.description, item.completionNote]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter(Boolean);

      await req.payload.create({
        collection: "timeline-events",
        data: {
          description: descriptionParts.join("\n\n"),
          eventDate: item.completedAt ?? new Date().toISOString(),
          isFeatured: false,
          relatedChecklist: checklist.id,
          relatedTaskKey: item.id,
          sortOrder: 0,
          status: checklist.status,
          title: eventTitle,
          type: "project",
          visibility: checklist.visibility,
        },
        overrideAccess: true,
      });
    }
  }

  return doc;
};

export const Checklist: CollectionConfig = {
  slug: "checklists",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrPublished,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["title", "status", "visibility", "publishedAt", "updatedAt"],
    useAsTitle: "title",
  },
  defaultSort: "-updatedAt",
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    createSlugField(),
    {
      name: "summary",
      type: "textarea",
    },
    {
      name: "groups",
      type: "array",
      admin: {
        description: "Use groups such as subjects, chapters, or modules. Each group can hold its own checklist items.",
      },
      fields: [
        {
          name: "title",
          type: "text",
          required: true,
        },
        {
          name: "items",
          type: "array",
          admin: {
            description: "Mark an item complete, add a note, and SunnyPanel will create a timeline entry automatically.",
          },
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
              name: "isCompleted",
              type: "checkbox",
              defaultValue: false,
            },
            {
              name: "completedAt",
              type: "date",
              admin: {
                condition: (_, siblingData) => Boolean(siblingData?.isCompleted),
                description: "Optional. If omitted, the timeline record will use the current time.",
              },
            },
            {
              name: "completionNote",
              type: "textarea",
              admin: {
                condition: (_, siblingData) => Boolean(siblingData?.isCompleted),
              },
            },
          ],
        },
      ],
    },
    statusField,
    publishedAtField,
    visibilityField(),
  ],
  hooks: {
    afterChange: [syncChecklistCompletionsToTimeline],
  },
  labels: {
    plural: "Checklists",
    singular: "Checklist",
  },
};
