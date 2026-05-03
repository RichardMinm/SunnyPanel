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
  operation,
  previousDoc,
  req,
}) => {
  if (operation === "create" || !previousDoc || req.context?.skipChecklistTimelineSync) {
    return doc;
  }

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
      label: "清单标题",
      admin: {
        description: "例如：高等数学、线性代数、阅读计划。",
        placeholder: "例如：高等数学",
      },
      required: true,
    },
    createSlugField(),
    {
      name: "summary",
      type: "textarea",
      label: "说明",
      admin: {
        placeholder: "补一句这份清单的用途，例如：用于整理高数各章节学习进度。",
      },
    },
    {
      name: "groups",
      type: "array",
      label: "分组",
      admin: {
        description: "先创建章节或模块，再往每个分组里补具体条目。",
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
          label: "分组名称",
          admin: {
            placeholder: "例如：映射与函数",
          },
          required: true,
        },
        {
          name: "items",
          type: "array",
          label: "条目",
          admin: {
            description: "把具体知识点或任务写在这里。标记完成后会自动写入时间线。",
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
              label: "条目名称",
              admin: {
                placeholder: "例如：定义域、值域与映射关系",
              },
              required: true,
            },
            {
              name: "description",
              type: "textarea",
              label: "条目说明",
              admin: {
                placeholder: "可选：补充这一条要做什么，或者记录学习重点。",
              },
            },
            {
              name: "isCompleted",
              type: "checkbox",
              label: "已完成",
              defaultValue: false,
            },
            {
              name: "completedAt",
              type: "date",
              label: "完成时间",
              admin: {
                condition: (_, siblingData) => Boolean(siblingData?.isCompleted),
                description: "可选。不填时，时间线会自动使用当前时间。",
              },
            },
            {
              name: "completionNote",
              type: "textarea",
              label: "完成备注",
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
    plural: {
      en: "Checklists",
      zh: "清单",
    },
    singular: {
      en: "Checklist",
      zh: "清单",
    },
  },
};
