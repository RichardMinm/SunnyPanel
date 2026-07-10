/** Resource Readiness Guard — deterministic resource validation.
 *
 * Validates that write-candidate orchestrator tasks have the required
 * resource references (existing IDs or valid taskOutput refs).
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

export type ResourceReadinessErrorCode =
  | "RESOURCE_ID_MISSING"
  | "RESOURCE_ID_PLACEHOLDER"
  | "RESOURCE_ID_NOT_IN_CONTEXT"
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
    outputRefFields: ["planRef"],
    allowedProducerIntents: ["compose_plan", "create_plan"],
  },
  append_plan_item: {
    resourceKind: "plan",
    existingIdFields: ["planId"],
    outputRefFields: ["planRef"],
    allowedProducerIntents: ["compose_plan", "create_plan"],
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

/* ---- Resource index (from sanitized context) ---- */

export interface OrchestrationResourceIndex {
  planIds: Set<string>;
  checklistIds: Set<string>;
  scheduleItemIds: Set<string>;
}

/** Build a resource index from AgentPromptContext. */
export const buildResourceIndex = (context: {
  plans?: Array<{ id?: number | string | null }>;
  checklists?: Array<{ id?: number | string | null }>;
}): OrchestrationResourceIndex => ({
  planIds: new Set(
    (context.plans ?? [])
      .map((p) => (p.id != null ? String(p.id) : null))
      .filter((id): id is string => id !== null && isUsableResourceId(id)),
  ),
  checklistIds: new Set(
    (context.checklists ?? [])
      .map((c) => (c.id != null ? String(c.id) : null))
      .filter((id): id is string => id !== null && isUsableResourceId(id)),
  ),
  scheduleItemIds: new Set(),
});

/* ---- Task input ---- */

export interface GuardTaskInput {
  id: string;
  intent: string;
  args: Record<string, unknown>;
  dependsOn: string[];
}

/* ---- Main Guard ---- */

export const validateResourceReadiness = (params: {
  tasks: GuardTaskInput[];
  resourceIndex: OrchestrationResourceIndex;
}): ResourceReadinessResult => {
  const issues: ResourceReadinessIssue[] = [];

  for (const task of params.tasks) {
    const req = RESOURCE_REQUIREMENTS[task.intent];
    if (!req) continue; /* No resource requirement defined for this intent */

    const kind = req.resourceKind;
    const idSet = kind === "plan" ? params.resourceIndex.planIds
      : kind === "checklist" ? params.resourceIndex.checklistIds
      : params.resourceIndex.scheduleItemIds;

    /* Check existing resource ID */
    const hasExistingId = req.existingIdFields.some((field) => {
      const v = task.args[field];
      if (v == null) return false;
      /* Accept both string and numeric IDs */
      const idStr = String(v);
      return isUsableResourceId(idStr) && idSet.has(idStr);
    });

    if (hasExistingId) continue; /* Ready: existing resource found */

    /* Check taskOutput reference */
    const hasOutputRef = req.outputRefFields.some((field) => {
      const ref = task.args[field];
      if (!ref || typeof ref !== "object") return false;
      const r = ref as Record<string, unknown>;
      if (r.type !== "taskOutput") return false;

      const refTaskId = r.taskId;
      if (typeof refTaskId !== "string" || refTaskId === task.id) return false;

      /* Must have dependsOn */
      if (!task.dependsOn.includes(refTaskId)) return false;

      /* Producer task must exist and have allowed intent */
      const producer = params.tasks.find((t) => t.id === refTaskId);
      if (!producer) return false;
      if (!req.allowedProducerIntents.includes(producer.intent)) return false;

      return true;
    });

    if (hasOutputRef) continue; /* Ready: valid taskOutput reference */

    /* Try existing ID fields but with placeholder/invalid values */
    const hasPlaceholder = req.existingIdFields.some((field) => {
      const v = task.args[field];
      return v !== undefined && v !== null && !isUsableResourceId(v);
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
      return isUsableResourceId(v) && !idSet.has(String(v));
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
