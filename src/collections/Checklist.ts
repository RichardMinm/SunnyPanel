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
      admin: {
        description: "Checklist name, for example: 高等数学 / Linear Algebra / Reading Plan.",
        placeholder: "例如：高等数学",
      },
      required: true,
    },
    createSlugField(),
    {
      name: "summary",
      type: "textarea",
      admin: {
        placeholder: "补一句这份清单的用途，例如：用于整理高数各章节学习进度。",
      },
    },
    {
      name: "groups",
      type: "array",
      admin: {
        description: "Create chapter-level groups first, then add structured items inside each group.",
        initCollapsed: false,
      },
      defaultValue: [
        {
          items: [
            {
              isCompleted: false,
              title: "",
            },
          ],
          title: "",
        },
      ],
      labels: {
        plural: "章节 / 分组",
        singular: "分组",
      },
      minRows: 1,
      fields: [
        {
          name: "title",
          type: "text",
          admin: {
            placeholder: "例如：映射与函数",
          },
          required: true,
        },
        {
          name: "items",
          type: "array",
          admin: {
            description: "Add the exact topics or tasks inside this group. Completing an item will automatically create a timeline record.",
            initCollapsed: false,
          },
          defaultValue: [
            {
              isCompleted: false,
              title: "",
            },
          ],
          labels: {
            plural: "条目 / 任务",
            singular: "条目",
          },
          minRows: 1,
          fields: [
            {
              name: "title",
              type: "text",
              admin: {
                placeholder: "例如：定义域、值域与映射关系",
              },
              required: true,
            },
            {
              name: "description",
              type: "textarea",
              admin: {
                placeholder: "可选：补充这一条要做什么，或者记录学习重点。",
              },
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
                placeholder: "可选：例如，已完成习题 1-10，难点在反函数理解。",
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
