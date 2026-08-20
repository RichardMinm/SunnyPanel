import type { ChecklistDraft } from "../planning/checklist-draft";
import type { PlanDraft } from "../planning/draft";
import type { PlanReadiness, PlanSlots } from "../planning/readiness";
import type {
  ScheduleReadiness,
  ScheduleSlots,
  ScheduleSourceType,
} from "../schedule/readiness";
import type { ScheduleDraft } from "../schedule/draft";

/* ──── Enum types ──── */

export type SemanticDomain =
  | "general" | "learning" | "memory" | "planning"
  | "schedule" | "security" | "writing";

export type DialogueStage =
  | "exploring" | "clarifying" | "drafting" | "refining" | "confirming"
  | "executing" | "reviewing" | "completed";

export type EntityType =
  | "agent" | "article" | "checklist" | "memory" | "plan"
  | "project" | "schedule" | "timeline" | "topic"
  | "writing" | "unknown";

export type WorkflowId =
  | "none"
  | "writing_creation" | "writing_revision"
  | "plan_creation" | "plan_iteration"
  | "schedule_composition"
  | "learning_explanation" | "learning_plan"
  | "memory_curation"
  | "general_query"
  | "weekly_review";

export type TransitionType =
  | "continue_current_flow"
  | "deepen_current_flow"
  | "switch_domain"
  | "complete_flow"
  | "restart_flow"
  | "confirm_pending_action"
  | "cancel_pending_action"
  | "fallback";

export type RouteHintInfluence = "strong_hint" | "weak_hint" | "ignore";

export type RouteHintSource = "transition_engine" | "rule" | "fallback";

/* ──── Compound types ──── */

export type CurrentTarget = {
  entityType?: EntityType | null;
  entityName?: string | null;
  entityId?: string | number | null;
  topic?: string | null;
};

export type RouteHint = {
  suggestedAction?:
    | "cancel" | "capability" | "chat" | "clarify" | "create" | "delete"
    | "expand_answer" | "explain" | "query" | "summarize" | "update";
  suggestedTarget?:
    | "agent" | "checklist" | "last_topic" | "memory" | "plan"
    | "schedule" | "timeline" | "unknown" | "writing";
  contextualClues: string[];
  expectedIntents: string[];
  confidence: number;
  source: RouteHintSource;
};

export type SessionPatch = {
  domain?: SemanticDomain;
  stage?: DialogueStage;
  currentTarget?: Partial<CurrentTarget>;
  workflow?: WorkflowId;
};

export type TransitionOutput = {
  shouldUpdateSession: boolean;
  sessionPatch: SessionPatch;
  routeHint: RouteHint;
  transitionType: TransitionType;
  reason: string;
};

export type PlanningSessionState = {
  workflow?: Extract<WorkflowId, "plan_creation" | "plan_iteration">;
  sourcePlanId?: number | null;
  slots?: PlanSlots;
  readiness?: PlanReadiness;
  draft?: PlanDraft | null;
  checklistDraft?: ChecklistDraft | null;
  lastSuggestedQuestions?: string[];
  lastUpdatedAt?: string;
};

export type SchedulingSessionState = {
  workflow?: "schedule_from_plan" | "schedule_from_checklist" | "manual_schedule";
  sourceType?: ScheduleSourceType | null;
  sourcePlanId?: number | null;
  sourceChecklistId?: number | null;
  slots?: ScheduleSlots;
  readiness?: ScheduleReadiness;
  draft?: ScheduleDraft | null;
  lastSuggestedQuestions?: string[];
  lastUpdatedAt?: string;
};

/* ──── AgentSessionState ──── */

export type AgentSessionState = {
  schemaVersion: number;
  updatedAt: string;

  semantic: {
    domain: SemanticDomain;
    stage: DialogueStage;
    currentTarget: CurrentTarget;
    workflow: WorkflowId;
  };

  conversation: {
    lastTopic?: string | null;
    lastAnswerDepth?: "brief" | "expanded" | "detailed";
    lastAssistantAnswerSummary?: string | null;
    lastMentionedEntities?: string[];
    lastUserIntent?: string;
  };

  pending: {
    confirmation?: {
      actionId: string;
      summary: string;
      intent: string;
      riskLevel: "high" | "medium" | "low";
    } | null;
    clarification?: {
      question: string;
      missingFields?: string[];
      intent?: string;
    } | null;
    toolCall?: {
      toolName: string;
      toolArgs: Record<string, unknown>;
      reason: string;
    } | null;
  };

  planning?: PlanningSessionState;

  scheduling?: SchedulingSessionState;

  lastTransition?: {
    transitionType: TransitionType;
    reason: string;
    fromStage?: DialogueStage;
    toStage?: DialogueStage;
    fromDomain?: SemanticDomain;
    toDomain?: SemanticDomain;
  };
};

/* ──── Trace ──── */

export type TransitionTrace = {
  oldSession: AgentSessionState;
  transitionOutput: TransitionOutput;
  newSession: AgentSessionState;
  routeHint: RouteHint;
  routerOutput?: import("../router/types").AgentRouterOutput;
  arbitrationResult?: import("../intent/arbitration").AgentArbitrationDecision;
};
