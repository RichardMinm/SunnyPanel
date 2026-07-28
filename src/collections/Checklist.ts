import type { CollectionAfterChangeHook, CollectionConfig } from "payload";

import { adminsOnly, adminsOrPublished, canAccessAdmin } from "../lib/payload/access";
import {
  buildChecklistTimelineDescription,
  buildChecklistTimelineTitle,
  CHECKLIST_TIMELINE_SOURCE_TYPE,
  CHECKLIST_TIMELINE_TYPE,
} from "../lib/agent/checklist-timeline-semantics";
import {
  calculatePlanChecklistProgress,
} from "../lib/agent/planning/plan-checklist-progress";
import {
  createSlugField,
  publishedAtField,
  statusField,
  visibilityField,
} from "../lib/payload/fields";
import { withAdminNavGroup } from "../lib/payload/admin-groups";

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
  planId?: null | number | { id: number };
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

      await req.payload.create({
        collection: "timeline-events",
        data: {
          description: buildChecklistTimelineDescription({
            checklistTitle: checklist.title,
            completionNote: item.completionNote,
            groupTitle: group.title,
            itemDescription: item.description,
            itemTitle: item.title,
          }),
          eventDate: item.completedAt ?? new Date().toISOString(),
          isFeatured: false,
          relatedChecklist: checklist.id,
          relatedTaskKey: item.id,
          sortOrder: 0,
          sourceType: CHECKLIST_TIMELINE_SOURCE_TYPE,
          status: checklist.status,
          title: buildChecklistTimelineTitle({
            checklistTitle: checklist.title,
            groupTitle: group.title,
            itemTitle: item.title,
          }),
          type: CHECKLIST_TIMELINE_TYPE,
          visibility: checklist.visibility,
        },
        overrideAccess: true,
      });
    }
  }

  return doc;
};

export const resolvePlanId = (doc: ChecklistDocument): number | null => {
  const raw = doc.planId;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "number") {
    return (raw as { id: number }).id;
  }
  return null;
};

export const syncPlanProgressOnChecklistChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  /* Only act on updates, skip if context flag is set */
  if (operation !== "update" || !previousDoc || req.context?.skipChecklistPlanProgressSync) return doc;

  const checklist = doc as ChecklistDocument;
  const planId = resolvePlanId(checklist);
  if (planId === null) return doc;

  /* Fetch current plan progress to avoid unnecessary write */
  const currentPlan = await req.payload.findByID({
    collection: "plans",
    id: planId,
    overrideAccess: true,
    depth: 0,
    req,
  });

  /* Fetch all checklists linked to this plan via planId */
  const linkedChecklists = await req.payload.find({
    collection: "checklists",
    depth: 0,
    limit: 200,
    overrideAccess: true,
    pagination: false,
    req,
    where: { planId: { equals: planId } },
  });

  const progress = calculatePlanChecklistProgress({
    checklists: linkedChecklists.docs.map((cl) => ({
      groups: (cl as ChecklistDocument).groups,
      id: cl.id,
    })),
  });

  /* Only persist when progress actually changed */
  if ((currentPlan as { progress?: number | null }).progress === progress.completionRate) {
    return doc;
  }

  await req.payload.update({
    collection: "plans",
    data: { progress: progress.completionRate },
    id: planId,
    overrideAccess: true,
    req,
  });

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
    ...withAdminNavGroup("content"),
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
      name: "planId",
      type: "relationship",
      relationTo: "plans",
      label: "关联计划",
      admin: {
        description: "此清单所属的计划。清单也可以独立存在，不强制关联。",
        position: "sidebar",
      },
      index: true,
      required: false,
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
    afterChange: [syncChecklistCompletionsToTimeline, syncPlanProgressOnChecklistChange],
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
