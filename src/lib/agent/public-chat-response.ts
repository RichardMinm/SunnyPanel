import { sanitizeAffectedDocuments } from "./affected-documents";
import {
  parsePendingAction,
  type AgentChatResponse,
  type AgentEngine,
  type AgentIntent,
  type PendingAction,
  type ProposedAgentAction,
} from "./schemas";
import { parseScheduleCreationPublicPresentation } from "./schedule/public-confirmation-presentation";

export type PublicAgentChatResponse = Omit<
  AgentChatResponse,
  "lastRollbackPayload"
>;

type PublicPendingActionOptions = {
  deriveSchedulePresentationFromSnapshot?: boolean;
};

type PublicAgentActionChange = ProposedAgentAction["changes"][number];

const actionOperations = new Set<PublicAgentActionChange["operation"]>([
  "create",
  "delete",
  "update",
]);
const actionRiskLevels = new Set<ProposedAgentAction["riskLevel"]>([
  "high",
  "low",
  "medium",
]);
const actionVisibilities = new Set<
  NonNullable<PublicAgentActionChange["visibility"]>
>([
  "private",
  "public",
  "unknown",
]);
const executableFieldNames = new Set([
  "afterSnapshot",
  "beforeSnapshot",
  "lastRollbackPayload",
  "rollbackPayload",
]);
const engineValues = new Set<AgentEngine>([
  "glm",
  "heuristic",
  "model",
  "openai",
  "openai-compatible",
  "workflow",
  "zai",
]);

export const parsePositiveSafeInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

const stripExecutableFields = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripExecutableFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      executableFieldNames.has(key)
        ? []
        : [[key, stripExecutableFields(item)]],
    ),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const copyArray = (value: unknown): unknown[] | undefined =>
  Array.isArray(value)
    ? stripExecutableFields(value) as unknown[]
    : undefined;

const copyRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value)
    ? stripExecutableFields(value) as Record<string, unknown>
    : undefined;

const sanitizePublicActionChange = (
  value: unknown,
): null | PublicAgentActionChange => {
  if (
    !isRecord(value)
    || typeof value.collection !== "string"
    || typeof value.operation !== "string"
    || !actionOperations.has(value.operation as PublicAgentActionChange["operation"])
    || typeof value.preview !== "string"
  ) {
    return null;
  }

  const documentId = parsePositiveSafeInteger(value.documentId);
  const visibility = typeof value.visibility === "string"
    && actionVisibilities.has(
      value.visibility as NonNullable<PublicAgentActionChange["visibility"]>,
    )
    ? value.visibility as NonNullable<PublicAgentActionChange["visibility"]>
    : undefined;

  return {
    ...(typeof value.afterPreview === "string"
      ? { afterPreview: value.afterPreview }
      : {}),
    ...(typeof value.beforePreview === "string"
      ? { beforePreview: value.beforePreview }
      : {}),
    collection: value.collection,
    ...(documentId ? { documentId } : {}),
    operation: value.operation as PublicAgentActionChange["operation"],
    preview: value.preview,
    ...(typeof value.timelineAffected === "boolean"
      ? { timelineAffected: value.timelineAffected }
      : {}),
    ...(visibility ? { visibility } : {}),
  };
};

const sanitizePublicProposedAgentAction = (
  value: unknown,
  options: PublicPendingActionOptions,
): null | ProposedAgentAction => {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || value.id.length === 0
    || typeof value.intent !== "string"
    || typeof value.riskLevel !== "string"
    || !actionRiskLevels.has(value.riskLevel as ProposedAgentAction["riskLevel"])
    || typeof value.summary !== "string"
    || !Array.isArray(value.changes)
  ) {
    return null;
  }

  const affectedDocuments = sanitizeAffectedDocuments(value.affectedDocuments);
  const changes = value.changes
    .map(sanitizePublicActionChange)
    .filter((item): item is PublicAgentActionChange => item !== null);
  const explicitPresentation = isRecord(value.publicPresentation)
    ? value.publicPresentation.scheduleCreation
    : undefined;
  const scheduleCreation = value.intent === "create_schedule_items"
    ? parseScheduleCreationPublicPresentation(
        explicitPresentation
        ?? (options.deriveSchedulePresentationFromSnapshot
          ? value.afterSnapshot
          : undefined),
      )
    : null;

  return {
    args: stripExecutableFields(value.args),
    ...(affectedDocuments ? { affectedDocuments } : {}),
    changes,
    id: value.id,
    intent: value.intent as ProposedAgentAction["intent"],
    ...(typeof value.requiresConfirmation === "boolean"
      ? { requiresConfirmation: value.requiresConfirmation }
      : {}),
    riskLevel: value.riskLevel as ProposedAgentAction["riskLevel"],
    ...(scheduleCreation
      ? { publicPresentation: { scheduleCreation } }
      : {}),
    ...(typeof value.rollbackAvailable === "boolean"
      ? { rollbackAvailable: value.rollbackAvailable }
      : {}),
    summary: value.summary,
    ...(typeof value.toolName === "string"
      ? { toolName: value.toolName }
      : {}),
    ...(typeof value.capability === "string"
      ? { capability: value.capability }
      : {}),
  };
};

const sanitizeResumeQueue = (value: unknown) => {
  const parsed = parsePendingAction(stripExecutableFields(value));

  return parsed?.type === "await_queue_resume" ? parsed : undefined;
};

export const sanitizePublicPendingAction = (
  value: unknown,
  options: PublicPendingActionOptions = {
    deriveSchedulePresentationFromSnapshot: true,
  },
): null | PendingAction => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "await_confirmation") {
    const action = sanitizePublicProposedAgentAction(value.action, options);
    if (!action) return null;

    const deferredActions = Array.isArray(value.deferredActions)
      ? value.deferredActions
          .map((item) => sanitizePublicProposedAgentAction(item, options))
          .filter((item): item is ProposedAgentAction => item !== null)
      : [];
    const resumeQueue = sanitizeResumeQueue(value.resumeQueue);

    return {
      action,
      ...(deferredActions.length > 0 ? { deferredActions } : {}),
      ...(typeof value.orchestrationId === "string"
        ? { orchestrationId: value.orchestrationId }
        : {}),
      ...(resumeQueue ? { resumeQueue } : {}),
      type: "await_confirmation",
    };
  }

  if (value.type === "await_batch_confirmation") {
    if (!Array.isArray(value.actions)) return null;

    const actions = value.actions
      .map((item) => sanitizePublicProposedAgentAction(item, options))
      .filter((item): item is ProposedAgentAction => item !== null);
    if (actions.length === 0) return null;

    const resumeQueue = sanitizeResumeQueue(value.resumeQueue);

    return {
      actions,
      ...(typeof value.orchestrationId === "string"
        ? { orchestrationId: value.orchestrationId }
        : {}),
      ...(resumeQueue ? { resumeQueue } : {}),
      type: "await_batch_confirmation",
    };
  }

  return parsePendingAction(stripExecutableFields(value));
};

const parsePublicAgentChatResponseValue = (
  value: unknown,
  options: PublicPendingActionOptions,
): null | Partial<PublicAgentChatResponse> => {
  if (!isRecord(value)) {
    return null;
  }

  const affectedDocuments = sanitizeAffectedDocuments(value.affectedDocuments);
  const engine = typeof value.engine === "string"
    && engineValues.has(value.engine as AgentEngine)
    ? value.engine as AgentEngine
    : undefined;
  const lastRollbackSourceRunId = parsePositiveSafeInteger(
    value.lastRollbackSourceRunId,
  );
  const pendingAction = "pendingAction" in value
    ? value.pendingAction === null
      ? null
      : sanitizePublicPendingAction(value.pendingAction, options)
    : undefined;
  const threadId = parsePositiveSafeInteger(value.threadId);

  return {
    ...(copyArray(value.activitySteps)
      ? { activitySteps: copyArray(value.activitySteps) as AgentChatResponse["activitySteps"] }
      : {}),
    ...(affectedDocuments ? { affectedDocuments } : {}),
    ...(typeof value.assistantMessage === "string"
      ? { assistantMessage: value.assistantMessage }
      : {}),
    ...(copyArray(value.backendTraceEvents)
      ? { backendTraceEvents: copyArray(value.backendTraceEvents) as AgentChatResponse["backendTraceEvents"] }
      : {}),
    ...(typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? { confidence: value.confidence }
      : {}),
    ...(typeof value.contextSummary === "string"
      ? { contextSummary: value.contextSummary }
      : {}),
    ...(engine ? { engine } : {}),
    ...(typeof value.intent === "string"
      ? { intent: value.intent as AgentIntent["intent"] }
      : {}),
    ...(lastRollbackSourceRunId ? { lastRollbackSourceRunId } : {}),
    ...(pendingAction !== undefined ? { pendingAction } : {}),
    ...(value.planningChecklistDraft === null
      ? { planningChecklistDraft: null }
      : copyRecord(value.planningChecklistDraft)
        ? { planningChecklistDraft: copyRecord(value.planningChecklistDraft) as NonNullable<AgentChatResponse["planningChecklistDraft"]> }
        : {}),
    ...(value.planningDraft === null
      ? { planningDraft: null }
      : copyRecord(value.planningDraft)
        ? { planningDraft: copyRecord(value.planningDraft) as NonNullable<AgentChatResponse["planningDraft"]> }
        : {}),
    ...(value.schedulingDraft === null
      ? { schedulingDraft: null }
      : copyRecord(value.schedulingDraft)
        ? { schedulingDraft: copyRecord(value.schedulingDraft) as NonNullable<AgentChatResponse["schedulingDraft"]> }
        : {}),
    ...(copyArray(value.trace)
      ? { trace: copyArray(value.trace) as AgentChatResponse["trace"] }
      : {}),
    ...(copyRecord(value.turnAudit)
      ? { turnAudit: copyRecord(value.turnAudit) as AgentChatResponse["turnAudit"] }
      : {}),
    ...(copyRecord(value.perfTrace)
      ? { perfTrace: copyRecord(value.perfTrace) as AgentChatResponse["perfTrace"] }
      : {}),
    ...(threadId ? { threadId } : {}),
    ...(copyRecord(value.tokenUsage)
      ? { tokenUsage: copyRecord(value.tokenUsage) as AgentChatResponse["tokenUsage"] }
      : {}),
    ...(typeof value.turnId === "string" ? { turnId: value.turnId } : {}),
    ...(typeof value.workbenchMode === "string"
      ? { workbenchMode: value.workbenchMode }
      : {}),
  };
};

/**
 * Parses untrusted JSON/SSE terminal bodies through the explicit public
 * allowlist. Raw snapshots are ignored rather than converted client-side.
 */
export const parsePublicAgentChatResponse = (
  value: unknown,
): null | Partial<PublicAgentChatResponse> =>
  parsePublicAgentChatResponseValue(value, {
    deriveSchedulePresentationFromSnapshot: false,
  });

export const projectPublicAgentChatResponse = (
  value: AgentChatResponse,
): PublicAgentChatResponse => {
  const parsed = parsePublicAgentChatResponseValue(value, {
    deriveSchedulePresentationFromSnapshot: true,
  });

  return {
    ...(parsed ?? {}),
    assistantMessage: value.assistantMessage,
    engine: value.engine,
    intent: value.intent,
    pendingAction: parsed && "pendingAction" in parsed
      ? parsed.pendingAction ?? null
      : null,
  };
};
