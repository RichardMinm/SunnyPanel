import type { Checklist, Plan } from "@/payload-types";

import {
  appendPlanLink,
  normalizePlanLinkedContent,
  type PlanLinkedContent,
} from "@/lib/core-linkage/plan-links";
import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import type { CreateChecklistArgs } from "../schemas";
import {
  createAgentRun,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";
import { validateChecklistGroupsData } from "../write-schemas";

export type ChecklistCreateData = {
  groups: Array<{
    items: Array<{
      description: null | string;
      isCompleted: false;
      title: string;
    }>;
    title: string;
  }>;
  planId?: null | number;
  slug: string;
  status: "draft" | "published";
  summary: null | string;
  title: string;
  visibility: "private" | "public";
};

export type CreateChecklistRollbackPayload = {
  strategy: "delete_created_document";
  target: {
    collection: "checklists";
    documentId: number;
  };
};

export type { PlanLinkedContent } from "@/lib/core-linkage/plan-links";

export type CreateChecklistPlanLinkRollbackPayload = {
  strategy: "delete_created_checklist_and_restore_plan_links";
  target: {
    beforeLinkedContent: PlanLinkedContent;
    checklistId: number;
    expectedAddedLink: {
      relationTo: "checklists";
      value: number;
    };
    planId: number;
  };
};

export type CreateChecklistExecutionResult = AgentToolResult & {
  afterLinkedContent: null | PlanLinkedContent;
  beforeLinkedContent: null | PlanLinkedContent;
  checklistId: number;
  groupsCount: number;
  itemsCount: number;
  linkedPlanId: null | number;
  rollbackAvailable: true;
  rollbackPayload: CreateChecklistPlanLinkRollbackPayload | CreateChecklistRollbackPayload;
  title: string;
  type: "create_checklist";
};

type ChecklistCreatePayload = {
  create: (input: {
    collection: "checklists";
    data: ChecklistCreateData;
    overrideAccess: true;
  }) => Promise<unknown>;
  delete: (input: {
    collection: "checklists";
    id: number;
    overrideAccess: true;
  }) => Promise<unknown>;
  find: (input: {
    collection: "checklists";
    depth: 0;
    limit: 1;
    overrideAccess: true;
    pagination: false;
    where: {
      slug: {
        equals: string;
      };
    };
  }) => Promise<{
    docs: unknown[];
    totalDocs?: number;
  }>;
  findByID: (input: {
    collection: "plans";
    depth: 0;
    id: number;
    overrideAccess: true;
  }) => Promise<null | unknown>;
  update: (input: {
    collection: "plans";
    data: {
      linkedContent: PlanLinkedContent;
    };
    depth: 0;
    id: number;
    overrideAccess: true;
  }) => Promise<unknown>;
};

type BuildChecklistCreateDataOptions = {
  slug: string;
};

type ResolveUniqueChecklistSlugOptions = {
  payload: Pick<ChecklistCreatePayload, "find">;
  preferredBase?: string;
};

type CreateChecklistFromIntentOptions = {
  payload?: ChecklistCreatePayload;
  userId?: number;
};

type CreateAgentRunPayload = NonNullable<Parameters<typeof createAgentRun>[0]["payload"]>;

export class ChecklistCreateValidationError extends Error {
  code: string;
  missingFields: string[];

  constructor(message: string, options: { code: string; missingFields?: string[] }) {
    super(message);
    this.name = "ChecklistCreateValidationError";
    this.code = options.code;
    this.missingFields = options.missingFields ?? [];
  }
}

const slugMaxLength = 64;

const trimRequired = (value: string | undefined, field: string) => {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    throw new ChecklistCreateValidationError(`create_checklist missing required field: ${field}`, {
      code: "missing_required_field",
      missingFields: [field],
    });
  }

  return trimmed;
};

const stableHash = (value: string) => {
  let hash = 5381;

  for (const char of value) {
    hash = ((hash << 5) + hash + char.codePointAt(0)!) >>> 0;
  }

  return hash.toString(36).slice(0, 8);
};

const normalizeSlugPart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const truncateSlug = (value: string) => value.slice(0, slugMaxLength).replace(/-+$/g, "");

export const createChecklistSlugBase = (title: string) => {
  const normalized = normalizeSlugPart(title);
  const base = normalized || `checklist-${stableHash(title || "checklist")}`;

  return truncateSlug(base) || `checklist-${stableHash("checklist")}`;
};

const slugCandidate = (base: string, title: string, attempt: number) => {
  if (attempt === 0) {
    return truncateSlug(base);
  }

  const suffix = `${stableHash(`${title}:${attempt}`)}-${attempt + 1}`;
  const prefix = truncateSlug(base).slice(0, Math.max(1, slugMaxLength - suffix.length - 1)).replace(/-+$/g, "");

  return `${prefix}-${suffix}`;
};

export const resolveUniqueChecklistSlug = async (
  title: string,
  options: ResolveUniqueChecklistSlugOptions,
) => {
  const base = createChecklistSlugBase(options.preferredBase ?? title);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = slugCandidate(base, title, attempt);
    const existing = await options.payload.find({
      collection: "checklists",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: {
          equals: candidate,
        },
      },
    });

    if ((existing.totalDocs ?? existing.docs.length) === 0) {
      return candidate;
    }
  }

  return slugCandidate(`checklist-${stableHash(`${title}:fallback`)}`, title, 8);
};

export const buildChecklistCreateData = (
  args: CreateChecklistArgs,
  options: BuildChecklistCreateDataOptions,
): ChecklistCreateData => {
  const title = trimRequired(args.title, "title");
  const groups = args.groups;

  if (!Array.isArray(groups) || groups.length === 0) {
    throw new ChecklistCreateValidationError("create_checklist requires at least one group", {
      code: "missing_required_field",
      missingFields: ["groups"],
    });
  }

  const sanitizedGroups = groups.map((group, groupIndex) => {
    const groupTitle = trimRequired(group.title, `groups.${groupIndex}.title`);

    if (!Array.isArray(group.items) || group.items.length === 0) {
      throw new ChecklistCreateValidationError(
        `create_checklist requires at least one item in groups.${groupIndex}`,
        {
          code: "missing_required_field",
          missingFields: [`groups.${groupIndex}.items`],
        },
      );
    }

    return {
      items: group.items.map((item, itemIndex) => ({
        description: item.description?.trim() ? item.description.trim() : null,
        isCompleted: false,
        title: trimRequired(item.title, `groups.${groupIndex}.items.${itemIndex}.title`),
      })),
      title: groupTitle,
    };
  });
  const validatedGroups = validateChecklistGroupsData(sanitizedGroups);

  return {
    groups: validatedGroups.map((group) => ({
      items: (group.items ?? []).map((item) => ({
        description: item.description ?? null,
        isCompleted: false,
        title: item.title,
      })),
      title: group.title,
    })),
    planId: typeof args.sourcePlanId === "number" ? args.sourcePlanId : null,
    slug: trimRequired(options.slug, "slug"),
    status: args.status ?? "draft",
    summary: args.summary?.trim() ? args.summary.trim() : null,
    title,
    visibility: args.visibility ?? "private",
  };
};

export const buildCreateChecklistRollbackPayload = (
  documentId: number,
): CreateChecklistRollbackPayload => ({
  strategy: "delete_created_document",
  target: {
    collection: "checklists",
    documentId,
  },
});

export const buildCreateChecklistPlanLinkRollbackPayload = ({
  beforeLinkedContent,
  checklistId,
  planId,
}: {
  beforeLinkedContent: PlanLinkedContent;
  checklistId: number;
  planId: number;
}): CreateChecklistPlanLinkRollbackPayload => ({
  strategy: "delete_created_checklist_and_restore_plan_links",
  target: {
    beforeLinkedContent,
    checklistId,
    expectedAddedLink: {
      relationTo: "checklists",
      value: checklistId,
    },
    planId,
  },
});

export const appendChecklistLinkToPlanLinkedContent = (
  value: null | unknown,
  checklistId: number,
): PlanLinkedContent => appendPlanLink(value, { relationTo: "checklists", value: checklistId });

const countChecklistItems = (groups: ChecklistCreateData["groups"]) =>
  groups.reduce((count, group) => count + group.items.length, 0);

const truncateTraceText = (value: null | string | undefined, maxLength = 180) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
};

const parseCreatedChecklist = (created: unknown, fallback: ChecklistCreateData) => {
  const doc = created as Partial<Checklist>;

  if (typeof doc.id !== "number") {
    throw new ChecklistCreateValidationError("Payload did not return a created checklist id", {
      code: "missing_created_checklist_id",
    });
  }

  return {
    id: doc.id,
    slug: typeof doc.slug === "string" ? doc.slug : fallback.slug,
    status: doc.status ?? fallback.status,
    title: typeof doc.title === "string" ? doc.title : fallback.title,
    visibility: doc.visibility ?? fallback.visibility,
  };
};

const resolveSourcePlanForLinking = async (
  payload: Pick<ChecklistCreatePayload, "findByID">,
  sourcePlanId: number,
) => {
  const plan = await payload.findByID({
    collection: "plans",
    depth: 0,
    id: sourcePlanId,
    overrideAccess: true,
  });

  if (!plan || typeof (plan as { id?: unknown }).id !== "number") {
    throw new ChecklistCreateValidationError(`sourcePlanId ${sourcePlanId} 对应的计划不存在或无法访问。`, {
      code: "source_plan_not_found",
      missingFields: ["sourcePlanId"],
    });
  }

  return plan as Pick<Plan, "id" | "linkedContent" | "title">;
};

const deleteCreatedChecklistForCompensation = async (
  payload: Pick<ChecklistCreatePayload, "delete">,
  checklistId: number,
) => {
  await payload.delete({
    collection: "checklists",
    id: checklistId,
    overrideAccess: true,
  });
};

export const createChecklistFromIntent = async (
  args: CreateChecklistArgs,
  onTrace?: AgentExecutionTraceReporter,
  options: CreateChecklistFromIntentOptions = {},
): Promise<CreateChecklistExecutionResult> => {
  const userId = options.userId ?? getCurrentAgentUserId();

  if (typeof userId !== "number") {
    throw new ChecklistCreateValidationError("create_checklist requires an authenticated user context", {
      code: "missing_user_context",
      missingFields: ["userId"],
    });
  }

  onTrace?.({
    detail: truncateTraceText(args.sourceText) ?? "从确认后的清单草案创建正式清单。",
    id: "tool-create-checklist-prepare",
    kind: "action",
    status: "running",
    title: `准备创建清单「${args.title}」`,
  });

  const provisionalData = buildChecklistCreateData(args, {
    slug: createChecklistSlugBase(args.title),
  });
  const payload = (options.payload ?? (await getPayloadClient())) as ChecklistCreatePayload;
  const sourcePlanId = typeof args.sourcePlanId === "number" ? args.sourcePlanId : null;
  const sourcePlan = sourcePlanId != null
    ? await resolveSourcePlanForLinking(payload, sourcePlanId)
    : null;
  const beforeLinkedContent = sourcePlan
    ? normalizePlanLinkedContent(sourcePlan.linkedContent)
    : null;
  const slug = await resolveUniqueChecklistSlug(args.title, { payload });
  const data = {
    ...provisionalData,
    slug,
  };
  const groupsCount = data.groups.length;
  const itemsCount = countChecklistItems(data.groups);
  const createdChecklist = parseCreatedChecklist(
    await payload.create({
      collection: "checklists",
      data,
      overrideAccess: true,
    }),
    data,
  );
  let afterLinkedContent: null | PlanLinkedContent = null;
  let linkedPlanId: null | number = null;
  let rollbackPayload: CreateChecklistPlanLinkRollbackPayload | CreateChecklistRollbackPayload =
    buildCreateChecklistRollbackPayload(createdChecklist.id);

  if (sourcePlan && beforeLinkedContent) {
    afterLinkedContent = appendChecklistLinkToPlanLinkedContent(beforeLinkedContent, createdChecklist.id);
    rollbackPayload = buildCreateChecklistPlanLinkRollbackPayload({
      beforeLinkedContent,
      checklistId: createdChecklist.id,
      planId: sourcePlan.id,
    });

    try {
      await payload.update({
        collection: "plans",
        data: {
          linkedContent: afterLinkedContent,
        },
        depth: 0,
        id: sourcePlan.id,
        overrideAccess: true,
      });
      linkedPlanId = sourcePlan.id;
    } catch (error) {
      try {
        await deleteCreatedChecklistForCompensation(payload, createdChecklist.id);
      } catch (compensationError) {
        throw new ChecklistCreateValidationError(
          `清单已创建但关联计划失败，且补偿删除清单也失败：${error instanceof Error ? error.message : String(error)}；补偿失败：${compensationError instanceof Error ? compensationError.message : String(compensationError)}`,
          {
            code: "plan_link_failed_partial",
            missingFields: ["sourcePlanId"],
          },
        );
      }

      throw new ChecklistCreateValidationError(
        `清单创建后关联计划失败，已删除刚创建的清单作为回滚补偿：${error instanceof Error ? error.message : String(error)}`,
        {
          code: "plan_link_failed_rolled_back",
          missingFields: ["sourcePlanId"],
        },
      );
    }
  }

  onTrace?.({
    detail: [
      `已写入 ${groupsCount} 个分组 / ${itemsCount} 个条目，visibility=${createdChecklist.visibility}，status=${createdChecklist.status}。`,
      linkedPlanId ? `已关联到计划 #${linkedPlanId}。` : null,
    ].filter(Boolean).join(" "),
    id: "tool-create-checklist-created",
    kind: "write",
    status: "done",
    title: `已创建清单记录 #${createdChecklist.id}`,
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "checklists",
        documentId: createdChecklist.id,
        operation: "create",
        visibility: createdChecklist.visibility,
      },
      ...(linkedPlanId
        ? [
            {
              collection: "plans",
              documentId: linkedPlanId,
              operation: "update" as const,
              visibility: "unknown" as const,
            },
          ]
        : []),
    ],
    afterSnapshot: {
      afterLinkedContent,
      beforeLinkedContent,
      checklistId: createdChecklist.id,
      groupsCount,
      itemsCount,
      linkedPlanId,
      slug: createdChecklist.slug,
      status: createdChecklist.status,
      title: createdChecklist.title,
      visibility: createdChecklist.visibility,
    },
    beforeSnapshot: null,
    goal: args.sourceText ?? `创建清单「${createdChecklist.title}」`,
    relatedContent: [
      {
        relationTo: "checklists",
        value: createdChecklist.id,
      },
    ],
    ...(linkedPlanId ? { relatedPlan: linkedPlanId } : {}),
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `创建清单：${createdChecklist.title}`,
      },
      ...(truncateTraceText(args.sourceText)
        ? [
            {
              level: "info" as const,
              message: `来源：${truncateTraceText(args.sourceText)}`,
            },
          ]
        : []),
    ],
    summary: linkedPlanId
      ? `Agent 已创建清单「${createdChecklist.title}」，包含 ${groupsCount} 个分组 / ${itemsCount} 个条目，并关联到计划 #${linkedPlanId}。`
      : `Agent 已创建清单「${createdChecklist.title}」，包含 ${groupsCount} 个分组 / ${itemsCount} 个条目。`,
    title: `Agent created checklist · ${createdChecklist.title}`,
    userId,
    workflow: "planning",
    ...(options.payload ? { payload: payload as unknown as CreateAgentRunPayload } : {}),
  });

  onTrace?.({
    detail: "本次清单创建动作已经写入 AgentRun 审计记录。",
    id: "tool-create-checklist-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    affectedDocuments: [
      { collection: "checklists", documentId: createdChecklist.id, operation: "create", visibility: createdChecklist.visibility },
      ...(linkedPlanId ? [{ collection: "plans", documentId: linkedPlanId, operation: "update" as const, visibility: "unknown" as const }] : []),
    ],
    afterLinkedContent,
    assistantMessage: linkedPlanId
      ? `已创建清单「${createdChecklist.title}」，包含 ${groupsCount} 个分组 / ${itemsCount} 个条目，并已关联到计划 #${linkedPlanId}。`
      : `已创建清单「${createdChecklist.title}」，包含 ${groupsCount} 个分组 / ${itemsCount} 个条目。`,
    beforeLinkedContent,
    checklistId: createdChecklist.id,
    groupsCount,
    itemsCount,
    linkedPlanId,
    pendingAction: null,
    rollbackAvailable: true,
    rollbackPayload,
    title: createdChecklist.title,
    type: "create_checklist",
  };
};
