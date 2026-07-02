import type { AgentIntent } from "../schemas";
import { normalizeSessionState } from "../session/normalize-session";
import type { AgentSessionState } from "../session/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCreatedPlanIntent = (intent: AgentIntent["intent"]) =>
  intent === "create_plan" || intent === "compose_plan";

const isPlanningPlanCreationSession = (session: AgentSessionState) =>
  session.semantic.domain === "planning" ||
  session.semantic.workflow === "plan_creation" ||
  session.planning?.workflow === "plan_creation";

export const extractCreatedPlanIdFromExecutionResult = (execution: unknown): number | null => {
  if (!isRecord(execution)) {
    return null;
  }

  if (typeof execution.createdPlanId === "number" && Number.isFinite(execution.createdPlanId)) {
    return execution.createdPlanId;
  }

  if (typeof execution.planId === "number" && Number.isFinite(execution.planId)) {
    return execution.planId;
  }

  return null;
};

export const backfillCreatedPlanIdIntoPlanningSession = ({
  createdPlanId,
  now = () => new Date().toISOString(),
  sessionState,
}: {
  createdPlanId: number;
  now?: () => string;
  sessionState: unknown;
}): AgentSessionState | undefined => {
  if (!Number.isFinite(createdPlanId)) {
    return undefined;
  }

  const session = normalizeSessionState(sessionState);

  if (!isPlanningPlanCreationSession(session)) {
    return undefined;
  }

  const updatedAt = now();
  const planning = session.planning ?? {};
  const draft = planning.draft
    ? {
        ...planning.draft,
        sourcePlanId: createdPlanId,
      }
    : planning.draft;
  const checklistDraft = planning.checklistDraft && typeof planning.checklistDraft.sourcePlanId !== "number"
    ? {
        ...planning.checklistDraft,
        sourcePlanId: createdPlanId,
      }
    : planning.checklistDraft;

  return {
    ...session,
    updatedAt,
    semantic: {
      ...session.semantic,
      currentTarget: {
        ...session.semantic.currentTarget,
        entityId: createdPlanId,
        entityType: "plan",
      },
      domain: "planning",
      stage: "completed",
      workflow: "plan_creation",
    },
    planning: {
      ...planning,
      ...(checklistDraft !== undefined ? { checklistDraft } : {}),
      ...(draft !== undefined ? { draft } : {}),
      lastUpdatedAt: updatedAt,
      sourcePlanId: createdPlanId,
      workflow: "plan_creation",
    },
  };
};

export const resolveCreatedPlanConversationState = ({
  execution,
  intent,
  sessionState,
}: {
  execution: unknown;
  intent: AgentIntent["intent"];
  sessionState?: unknown;
}): AgentSessionState | undefined => {
  if (sessionState === undefined || !isCreatedPlanIntent(intent)) {
    return undefined;
  }

  const createdPlanId = extractCreatedPlanIdFromExecutionResult(execution);

  if (createdPlanId === null) {
    return undefined;
  }

  return backfillCreatedPlanIdIntoPlanningSession({
    createdPlanId,
    sessionState,
  });
};
