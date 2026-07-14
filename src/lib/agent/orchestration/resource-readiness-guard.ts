/** Resource Readiness Guard — deterministic resource validation.
 *
 * Validates that write-candidate orchestrator tasks have the required
 * existing resource references. Runtime taskOutput resolution is not supported.
 *
 * Runs AFTER Zod strict schema + DAG validation.
 * Runs BEFORE Draft / Dry-run / Policy Guard / Execute.
 *
 * Pure function: no DB, no model, no executor, no side effects.
 */

import { isUsableResourceId } from "./safety-classifier";

/* ---- Types ---- */

export type ResourceKind = "checklist" | "plan" | "schedule_item" | "timeline_event";

export interface ResourceRequirement {
  resourceKind: ResourceKind;
  existingIdFields: string[];
  outputRefFields: string[];
  allowedProducerIntents: string[];
}

export type ResourceProtocolEntry = Readonly<{
  allowedProducerIntents: readonly string[];
  existingIdFields: readonly string[];
  intent: string;
  outputRefFields: readonly string[];
  resourceKind: ResourceKind;
}>;

export type ResourceReadinessErrorCode =
  | "RESOURCE_ID_MISSING"
  | "RESOURCE_ID_PLACEHOLDER"
  | "RESOURCE_ID_NOT_IN_CONTEXT"
  | "RESOURCE_TITLE_CONFLICT"
  | "RESOURCE_OUTPUT_REF_UNSUPPORTED"
  | "RESOURCE_REF_MISSING"
  | "RESOURCE_OUTPUT_REF_INVALID"
  | "RESOURCE_OUTPUT_PRODUCER_INVALID"
  | "RESOURCE_DEPENDENCY_MISSING"
  | "RESOURCE_KIND_MISMATCH";

export interface ResourceReadinessIssue {
  taskId: string;
  intent: string;
  resourceKind: string;
  code: ResourceReadinessErrorCode;
  safeMessage: string;
}

export type ResourceReadinessResult =
  | { ready: true; issues: [] }
  | { ready: false; issues: ResourceReadinessIssue[] };

/* ---- Resource Requirement Map ---- */

const RESOURCE_REQUIREMENTS: Record<string, ResourceRequirement> = {
  schedule_plan: {
    resourceKind: "plan",
    existingIdFields: ["planId"],
    outputRefFields: [],
    allowedProducerIntents: [],
  },
  append_plan_item: {
    resourceKind: "plan",
    existingIdFields: ["planId"],
    outputRefFields: [],
    allowedProducerIntents: [],
  },
  complete_plan_item: {
    resourceKind: "plan",
    existingIdFields: ["planId"],
    outputRefFields: [],
    allowedProducerIntents: [],
  },
  reschedule_item: {
    resourceKind: "schedule_item",
    existingIdFields: ["scheduleItemId"],
    outputRefFields: [],
    allowedProducerIntents: [],
  },
  cancel_schedule_item: {
    resourceKind: "schedule_item",
    existingIdFields: ["scheduleItemId"],
    outputRefFields: [],
    allowedProducerIntents: [],
  },
};

/** Sanitized Prompt projection derived from the deterministic guard contract. */
export const getResourceProtocolProjection = (): readonly ResourceProtocolEntry[] =>
  Object.freeze(
    Object.entries(RESOURCE_REQUIREMENTS).map(([intent, requirement]) =>
      Object.freeze({
        allowedProducerIntents: Object.freeze([
          ...requirement.allowedProducerIntents,
        ]),
        existingIdFields: Object.freeze([...requirement.existingIdFields]),
        intent,
        outputRefFields: Object.freeze([...requirement.outputRefFields]),
        resourceKind: requirement.resourceKind,
      }),
    ),
  );

/* ---- Resource index (from sanitized context) ---- */

export interface OrchestrationResourceIndex {
  planIds: Set<string>;
  planTitlesById: ReadonlyMap<string, string>;
  checklistIds: Set<string>;
  checklistTitlesById: ReadonlyMap<string, string>;
  scheduleItemIds: Set<string>;
}

const normalizeResourceTitle = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
};

const buildTitleMap = (
  resources: Array<{ id?: number | string | null; title?: string | null }>,
): ReadonlyMap<string, string> => new Map(
  resources.flatMap((resource) => {
    const id = resource.id != null ? String(resource.id) : null;
    const title = normalizeResourceTitle(resource.title);
    return id !== null && isUsableResourceId(id) && title
      ? [[id, title] as const]
      : [];
  }),
);

/** Build a resource index from AgentPromptContext. */
export const buildResourceIndex = (context: {
  plans?: Array<{ id?: number | string | null; title?: string | null }>;
  checklists?: Array<{ id?: number | string | null; title?: string | null }>;
}): OrchestrationResourceIndex => {
  const plans = context.plans ?? [];
  const checklists = context.checklists ?? [];
  return {
    planIds: new Set(
      plans
      .map((p) => (p.id != null ? String(p.id) : null))
      .filter((id): id is string => id !== null && isUsableResourceId(id)),
    ),
    planTitlesById: buildTitleMap(plans),
    checklistIds: new Set(
      checklists
      .map((c) => (c.id != null ? String(c.id) : null))
      .filter((id): id is string => id !== null && isUsableResourceId(id)),
    ),
    checklistTitlesById: buildTitleMap(checklists),
    scheduleItemIds: new Set(),
  };
};

/* ---- Task input ---- */

export interface GuardTaskInput {
  id: string;
  intent: string;
  args: Record<string, unknown>;
  dependsOn: string[];
}

const normalizeResourceId = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const containsTaskOutputReference = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "taskOutput") return true;
  return Object.values(record).some(containsTaskOutputReference);
};

/* ---- Main Guard ---- */

export const validateResourceReadiness = (params: {
  tasks: GuardTaskInput[];
  resourceIndex: OrchestrationResourceIndex;
}): ResourceReadinessResult => {
  const issues: ResourceReadinessIssue[] = [];

  for (const task of params.tasks) {
    const req = RESOURCE_REQUIREMENTS[task.intent];

    if (containsTaskOutputReference(task.args)) {
      issues.push({
        taskId: task.id,
        intent: task.intent,
        resourceKind: req?.resourceKind ?? "unknown",
        code: "RESOURCE_OUTPUT_REF_UNSUPPORTED",
        safeMessage: `${task.intent} 引用了当前不支持的任务输出，请先确认资源 ID。`,
      });
      continue;
    }

    if (!req) continue; /* No resource requirement defined for this intent */

    const kind = req.resourceKind;
    const idSet = kind === "plan" ? params.resourceIndex.planIds
      : kind === "checklist" ? params.resourceIndex.checklistIds
      : params.resourceIndex.scheduleItemIds;

    /* Check existing resource ID */
    const existingId = req.existingIdFields
      .map((field) => normalizeResourceId(task.args[field]))
      .find((id): id is string => id !== null && isUsableResourceId(id) && idSet.has(id));

    if (existingId !== undefined) {
      const expectedTitle = kind === "plan"
        ? params.resourceIndex.planTitlesById.get(existingId)
        : undefined;
      const suppliedTitle = normalizeResourceTitle(task.args.planTitle);
      if (
        task.args.planTitle !== undefined
        && expectedTitle !== undefined
        && suppliedTitle !== expectedTitle
      ) {
        issues.push({
          taskId: task.id,
          intent: task.intent,
          resourceKind: kind,
          code: "RESOURCE_TITLE_CONFLICT",
          safeMessage: `${task.intent} 的资源 ID 与标题不一致，请确认后重试。`,
        });
        continue;
      }
      continue;
    }

    /* Try existing ID fields but with placeholder/invalid values */
    const hasPlaceholder = req.existingIdFields.some((field) => {
      const v = task.args[field];
      const id = normalizeResourceId(v);
      return v !== undefined && v !== null && (id === null || !isUsableResourceId(id));
    });

    if (hasPlaceholder) {
      issues.push({
        taskId: task.id,
        intent: task.intent,
        resourceKind: kind,
        code: "RESOURCE_ID_PLACEHOLDER",
        safeMessage: `${task.intent} 的资源 ID 无效，无法安全执行。`,
      });
      continue;
    }

    /* Try existing ID but not in context */
    const hasUnknownId = req.existingIdFields.some((field) => {
      const v = task.args[field];
      const id = normalizeResourceId(v);
      return id !== null && isUsableResourceId(id) && !idSet.has(id);
    });

    if (hasUnknownId) {
      issues.push({
        taskId: task.id,
        intent: task.intent,
        resourceKind: kind,
        code: "RESOURCE_ID_NOT_IN_CONTEXT",
        safeMessage: `${task.intent} 引用的资源 ID 不在当前上下文中。`,
      });
      continue;
    }

    /* No valid resource reference at all */
    issues.push({
      taskId: task.id,
      intent: task.intent,
      resourceKind: kind,
      code: "RESOURCE_ID_MISSING",
      safeMessage: `${task.intent} 缺少有效的资源引用，无法安全执行。`,
    });
  }

  return issues.length === 0
    ? { ready: true, issues: [] }
    : { ready: false, issues };
};
