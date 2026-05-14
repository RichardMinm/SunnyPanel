export type AgentChatMessage = {
  content: string;
  role: "assistant" | "user";
};

export type PlanExecutionModeValue = "agent" | "hybrid" | "manual";
export type PlanPriorityValue = "high" | "low" | "medium";
export type PlanStateValue = "active" | "backlog" | "done" | "paused";
export type AgentActionVisibility = "private" | "public" | "unknown";
export type TimelineComposerSourceType = "checklist_item" | "free_text" | "note" | "plan" | "post" | "update";
export type TimelineComposerEventType = "life" | "milestone" | "project";
export type ScheduleSourceType = "agent" | "checklist" | "manual" | "plan";

export type PlanProposal = {
  agentBrief: string;
  goal: string;
  keySteps: string[];
  motivation?: null | string;
  nextActions: string[];
  outOfScope?: null | string;
  risks: string[];
  scope?: null | string;
  successCriteria: string[];
  suggestedDueDate?: null | string;
  suggestedPriority: PlanPriorityValue;
  title: string;
};

export type ScheduleConflict = {
  endTime?: null | string;
  scheduleItemId: number;
  startTime?: null | string;
  title: string;
};

export type ScheduleProposal = {
  conflicts: ScheduleConflict[];
  date: string;
  description?: null | string;
  endTime?: null | string;
  isAllDay: boolean;
  priority: PlanPriorityValue;
  reason: string;
  relatedChecklistId?: null | number;
  relatedChecklistItemKey?: null | string;
  relatedPlanId?: null | number;
  startTime?: null | string;
  title: string;
};

export type ProposedAgentActionChange = {
  afterPreview?: string;
  beforePreview?: string;
  collection: string;
  documentId?: number;
  operation: "create" | "delete" | "update";
  preview: string;
  timelineAffected?: boolean;
  visibility?: AgentActionVisibility;
};

export type ProposedAgentAction = {
  args: unknown;
  affectedDocuments?: Array<{
    collection: string;
    documentId?: number;
    operation: "create" | "delete" | "update";
    visibility?: AgentActionVisibility;
  }>;
  afterSnapshot?: unknown;
  beforeSnapshot?: unknown;
  changes: ProposedAgentActionChange[];
  id: string;
  intent: AgentIntent["intent"];
  requiresConfirmation?: boolean;
  riskLevel: "high" | "low" | "medium";
  rollbackAvailable?: boolean;
  rollbackPayload?: unknown;
  summary: string;
  toolName?: string;
};

export type AgentWriteIntentName =
  | "add_completion_note"
  | "append_plan_item"
  | "complete_plan_item"
  | "compose_plan"
  | "compose_schedule_item"
  | "compose_timeline_event"
  | "create_plan"
  | "save_memory"
  | "weekly_review";

export type AgentDryRunClarifyResult = {
  assistantMessage: string;
  pendingAction: null | PendingAction;
  type: "clarify";
};

export type AgentDryRunProposedActionResult = {
  action: ProposedAgentAction;
  type: "proposed_action";
};

export type AgentDryRunBypassResult = {
  type: "bypass";
};

export type AgentDryRunResult =
  | AgentDryRunBypassResult
  | AgentDryRunClarifyResult
  | AgentDryRunProposedActionResult;

export type PendingAction = {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
  type: "await_completion_note";
} | {
  action: ProposedAgentAction;
  type: "await_confirmation";
} | {
  args: Partial<
    | AddCompletionNoteArgs
    | AppendPlanItemArgs
    | CompletePlanItemArgs
    | ComposePlanArgs
    | ComposeScheduleItemArgs
    | CreatePlanArgs
    | SaveMemoryArgs
  >;
  intent: Extract<
    AgentIntent["intent"],
    | "add_completion_note"
    | "append_plan_item"
    | "complete_plan_item"
    | "compose_plan"
    | "compose_schedule_item"
    | "create_plan"
    | "save_memory"
  >;
  missingFields: string[];
  question: string;
  type: "await_clarification";
};

export type CreatePlanArgs = {
  agentBrief?: null | string;
  description?: null | string;
  dueDate?: null | string;
  executionMode?: PlanExecutionModeValue;
  priority?: PlanPriorityValue;
  state?: PlanStateValue;
  title: string;
};

export type AppendPlanItemArgs = {
  checklistTitle: string;
  description?: null | string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type CompletePlanItemArgs = {
  checklistTitle: string;
  completedAt?: null | string;
  completionNote?: null | string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type AddCompletionNoteArgs = {
  checklistTitle: string;
  completionNote: string;
  groupTitle?: null | string;
  itemTitle: string;
};

export type ClarifyArgs = {
  missingFields?: string[];
  question: string;
};

export type QueryProgressArgs = {
  checklistTitle?: null | string;
  scope?: "all" | "checklists" | "plans";
};

export type EvaluatePlanArgs = {
  planId?: null | number;
  planTitle?: null | string;
};

export type AnswerQuestionArgs = {
  answer: string;
  suggestAction?: null | string;
};

export type SaveMemoryArgs = {
  confidence?: number;
  content: string;
  title?: null | string;
  type?: "fact" | "preference" | "project_context" | "workflow_rule" | "writing_style";
};

export type WeeklyReviewArgs = {
  createSuggestions?: boolean;
  now?: null | string;
  persistReview?: boolean;
};

export type ComposePlanArgs = {
  agentBrief?: null | string;
  goal?: null | string;
  keySteps?: string[];
  motivation?: null | string;
  nextActions?: string[];
  outOfScope?: null | string;
  proposal?: PlanProposal;
  risks?: string[];
  scope?: null | string;
  sourceText?: null | string;
  successCriteria?: string[];
  suggestedDueDate?: null | string;
  suggestedPriority?: PlanPriorityValue;
  title?: null | string;
};

export type ComposeScheduleItemArgs = {
  date?: null | string;
  description?: null | string;
  endTime?: null | string;
  isAllDay?: boolean;
  priority?: PlanPriorityValue;
  proposal?: ScheduleProposal;
  reason?: null | string;
  relatedChecklistId?: null | number;
  relatedChecklistItemKey?: null | string;
  relatedPlanId?: null | number;
  sourceText?: null | string;
  sourceType?: null | ScheduleSourceType;
  startTime?: null | string;
  title?: null | string;
};

export type ComposeTimelineEventArgs = {
  checklistTitle?: null | string;
  createEvent?: boolean;
  eventDate?: null | string;
  groupTitle?: null | string;
  isFeatured?: boolean;
  itemTitle?: null | string;
  relatedTaskKey?: null | string;
  sourceId?: null | number;
  sourceText?: null | string;
  sourceTitle?: null | string;
  sourceType?: null | TimelineComposerSourceType;
  type?: null | TimelineComposerEventType;
  visibility?: null | "private" | "public";
};

export type AgentIntent =
  | {
      args: AnswerQuestionArgs;
      confidence?: number;
      intent: "answer_question";
      reply?: string;
    }
  | {
      args: AddCompletionNoteArgs;
      confidence?: number;
      intent: "add_completion_note";
      reply?: string;
    }
  | {
      args: AppendPlanItemArgs;
      confidence?: number;
      intent: "append_plan_item";
      reply?: string;
    }
  | {
      args: ClarifyArgs;
      confidence?: number;
      intent: "clarify";
      reply?: string;
    }
  | {
      args: CompletePlanItemArgs;
      confidence?: number;
      intent: "complete_plan_item";
      reply?: string;
    }
  | {
      args: ComposePlanArgs;
      confidence?: number;
      intent: "compose_plan";
      reply?: string;
    }
  | {
      args: ComposeScheduleItemArgs;
      confidence?: number;
      intent: "compose_schedule_item";
      reply?: string;
    }
  | {
      args: ComposeTimelineEventArgs;
      confidence?: number;
      intent: "compose_timeline_event";
      reply?: string;
    }
  | {
      args: CreatePlanArgs;
      confidence?: number;
      intent: "create_plan";
      reply?: string;
    }
  | {
      args: EvaluatePlanArgs;
      confidence?: number;
      intent: "evaluate_plan";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_progress";
      reply?: string;
    }
  | {
      args: SaveMemoryArgs;
      confidence?: number;
      intent: "save_memory";
      reply?: string;
    }
  | {
      args: WeeklyReviewArgs;
      confidence?: number;
      intent: "weekly_review";
      reply?: string;
    };

export type AgentEngine = "glm" | "heuristic" | "workflow";

export type AgentTokenUsage = {
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  providerInputTokens?: number;
  providerOutputTokens?: number;
  providerTotalTokens?: number;
  source: "estimate" | "provider";
  totalTokens: number;
};

export type AgentChatResponse = {
  assistantMessage: string;
  confidence?: number;
  engine: AgentEngine;
  intent: AgentIntent["intent"];
  pendingAction: null | PendingAction;
  trace?: AgentTraceStep[];
  threadId?: number;
  tokenUsage?: AgentTokenUsage;
};

export type AgentTraceStep = {
  detail?: string;
  id: string;
  kind: "action" | "analysis" | "complete" | "context" | "error" | "write";
  status: "done" | "error" | "running";
  title: string;
};

const planPriorityValues = ["high", "low", "medium"] as const;
const planStateValues = ["active", "backlog", "done", "paused"] as const;
const executionModeValues = ["agent", "hybrid", "manual"] as const;
const progressScopeValues = ["all", "checklists", "plans"] as const;
const scheduleSourceTypeValues = ["agent", "checklist", "manual", "plan"] as const;
const timelineComposerSourceTypeValues = ["checklist_item", "free_text", "note", "plan", "post", "update"] as const;
const timelineComposerEventTypeValues = ["life", "milestone", "project"] as const;
const timelineComposerVisibilityValues = ["private", "public"] as const;
const agentIntentValues = [
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "clarify",
  "complete_plan_item",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_plan",
  "evaluate_plan",
  "query_progress",
  "save_memory",
  "weekly_review",
] as const;
const proposedActionRiskValues = ["high", "low", "medium"] as const;
const proposedActionOperationValues = ["create", "delete", "update"] as const;
const proposedActionVisibilityValues = ["private", "public", "unknown"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getOptionalEnum = <TOption extends readonly string[]>(
  value: unknown,
  options: TOption,
): TOption[number] | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  return options.includes(value) ? (value as TOption[number]) : undefined;
};

const getOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
};

const getRequiredString = (value: unknown) => {
  const normalized = getOptionalString(value);

  return normalized && normalized.length > 0 ? normalized : null;
};

const getOptionalDateString = (value: unknown) => {
  const normalized = getOptionalString(value);

  if (!normalized) {
    return undefined;
  }

  return Number.isNaN(Date.parse(normalized)) ? undefined : normalized;
};

const getOptionalNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const getOptionalStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => getOptionalString(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 12)
    : undefined;

const getConfidence = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
};

export const sanitizeChatMessages = (value: unknown): AgentChatMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const content = getRequiredString(item.content);
      const role = item.role === "assistant" || item.role === "user" ? item.role : null;

      if (!content || !role) {
        return null;
      }

      return {
        content,
        role,
      } satisfies AgentChatMessage;
    })
    .filter((item): item is AgentChatMessage => Boolean(item))
    .slice(-12);
};

export const parsePendingAction = (value: unknown): null | PendingAction => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "await_completion_note") {
    const checklistTitle = getRequiredString(value.checklistTitle);
    const itemTitle = getRequiredString(value.itemTitle);

    if (!checklistTitle || !itemTitle) {
      return null;
    }

    return {
      checklistTitle,
      groupTitle: getOptionalString(value.groupTitle) ?? null,
      itemTitle,
      type: "await_completion_note",
    };
  }

  if (value.type === "await_confirmation") {
    const action = parseProposedAgentAction(value.action);

    if (!action) {
      return null;
    }

    return {
      action,
      type: "await_confirmation",
    };
  }

  if (value.type !== "await_clarification" || !isRecord(value.args)) {
    return null;
  }

  const question = getRequiredString(value.question);
  const intent =
    value.intent === "add_completion_note" ||
    value.intent === "append_plan_item" ||
    value.intent === "complete_plan_item" ||
    value.intent === "compose_plan" ||
    value.intent === "compose_schedule_item" ||
    value.intent === "create_plan" ||
    value.intent === "save_memory"
      ? value.intent
      : null;

  if (!question || !intent) {
    return null;
  }

  return {
    args: value.args as Partial<
      | AddCompletionNoteArgs
      | AppendPlanItemArgs
      | CompletePlanItemArgs
      | ComposePlanArgs
      | ComposeScheduleItemArgs
      | CreatePlanArgs
      | SaveMemoryArgs
    >,
    intent,
    missingFields: Array.isArray(value.missingFields)
      ? value.missingFields.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    question,
    type: "await_clarification",
  };
};

export const parseProposedAgentAction = (value: unknown): null | ProposedAgentAction => {
  if (!isRecord(value)) {
    return null;
  }

  const id = getRequiredString(value.id);
  const intent = getOptionalEnum(value.intent, agentIntentValues);
  const riskLevel = getOptionalEnum(value.riskLevel, proposedActionRiskValues);
  const summary = getRequiredString(value.summary);

  if (!id || !intent || !riskLevel || !summary || !Array.isArray(value.changes)) {
    return null;
  }

  const changes = value.changes
    .map((change) => {
      if (!isRecord(change)) {
        return null;
      }

      const collection = getRequiredString(change.collection);
      const operation = getOptionalEnum(change.operation, proposedActionOperationValues);
      const preview = getRequiredString(change.preview);
      const documentId = getOptionalNumber(change.documentId);
      const afterPreview = getOptionalString(change.afterPreview);
      const beforePreview = getOptionalString(change.beforePreview);
      const timelineAffected = typeof change.timelineAffected === "boolean" ? change.timelineAffected : undefined;
      const visibility = getOptionalEnum(change.visibility, proposedActionVisibilityValues);

      if (!collection || !operation || !preview) {
        return null;
      }

      return {
        ...(afterPreview ? { afterPreview } : {}),
        ...(beforePreview ? { beforePreview } : {}),
        collection,
        ...(documentId ? { documentId } : {}),
        operation,
        preview,
        ...(typeof timelineAffected === "boolean" ? { timelineAffected } : {}),
        ...(visibility ? { visibility } : {}),
      };
    })
    .filter((change): change is ProposedAgentAction["changes"][number] => Boolean(change));

  if (changes.length === 0) {
    return null;
  }

  const affectedDocuments = Array.isArray(value.affectedDocuments)
    ? value.affectedDocuments
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }

          const collection = getRequiredString(item.collection);
          const operation = getOptionalEnum(item.operation, proposedActionOperationValues);
          const documentId = getOptionalNumber(item.documentId);
          const visibility = getOptionalEnum(item.visibility, proposedActionVisibilityValues);

          if (!collection || !operation) {
            return null;
          }

          return {
            collection,
            ...(documentId ? { documentId } : {}),
            operation,
            ...(visibility ? { visibility } : {}),
          };
        })
        .filter((item): item is NonNullable<ProposedAgentAction["affectedDocuments"]>[number] => Boolean(item))
    : undefined;

  return {
    args: value.args,
    ...(affectedDocuments && affectedDocuments.length > 0 ? { affectedDocuments } : {}),
    ...("afterSnapshot" in value ? { afterSnapshot: value.afterSnapshot } : {}),
    ...("beforeSnapshot" in value ? { beforeSnapshot: value.beforeSnapshot } : {}),
    changes,
    id,
    intent,
    ...(typeof value.requiresConfirmation === "boolean" ? { requiresConfirmation: value.requiresConfirmation } : {}),
    riskLevel,
    ...(typeof value.rollbackAvailable === "boolean" ? { rollbackAvailable: value.rollbackAvailable } : {}),
    ...("rollbackPayload" in value ? { rollbackPayload: value.rollbackPayload } : {}),
    summary,
    ...(typeof value.toolName === "string" ? { toolName: value.toolName } : {}),
  };
};

export const createClarifyIntent = (question: string, missingFields: string[] = []): AgentIntent => ({
  args: {
    missingFields,
    question,
  },
  intent: "clarify",
});

const parsePlanProposal = (value: unknown): undefined | PlanProposal => {
  if (!isRecord(value)) {
    return undefined;
  }

  const title = getRequiredString(value.title);
  const goal = getRequiredString(value.goal);
  const agentBrief = getRequiredString(value.agentBrief);
  const suggestedPriority = getOptionalEnum(value.suggestedPriority, planPriorityValues) ?? "medium";

  if (!title || !goal || !agentBrief) {
    return undefined;
  }

  return {
    agentBrief,
    goal,
    keySteps: getOptionalStringArray(value.keySteps) ?? [],
    motivation: getOptionalString(value.motivation) ?? null,
    nextActions: getOptionalStringArray(value.nextActions) ?? [],
    outOfScope: getOptionalString(value.outOfScope) ?? null,
    risks: getOptionalStringArray(value.risks) ?? [],
    scope: getOptionalString(value.scope) ?? null,
    successCriteria: getOptionalStringArray(value.successCriteria) ?? [],
    suggestedDueDate: getOptionalDateString(value.suggestedDueDate) ?? null,
    suggestedPriority,
    title,
  };
};

const parseScheduleConflicts = (value: unknown): ScheduleConflict[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const conflicts: ScheduleConflict[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const title = getRequiredString(item.title);
    const scheduleItemId = getOptionalNumber(item.scheduleItemId);

    if (!title || !scheduleItemId) {
      continue;
    }

    conflicts.push({
      endTime: getOptionalString(item.endTime) ?? null,
      scheduleItemId,
      startTime: getOptionalString(item.startTime) ?? null,
      title,
    });
  }

  return conflicts;
};

const parseScheduleProposal = (value: unknown): undefined | ScheduleProposal => {
  if (!isRecord(value)) {
    return undefined;
  }

  const title = getRequiredString(value.title);
  const date = getRequiredString(value.date);
  const reason = getRequiredString(value.reason);
  const priority = getOptionalEnum(value.priority, planPriorityValues) ?? "medium";

  if (!title || !date || !reason) {
    return undefined;
  }

  return {
    conflicts: parseScheduleConflicts(value.conflicts),
    date,
    description: getOptionalString(value.description) ?? null,
    endTime: getOptionalString(value.endTime) ?? null,
    isAllDay: typeof value.isAllDay === "boolean" ? value.isAllDay : false,
    priority,
    reason,
    relatedChecklistId: getOptionalNumber(value.relatedChecklistId) ?? null,
    relatedChecklistItemKey: getOptionalString(value.relatedChecklistItemKey) ?? null,
    relatedPlanId: getOptionalNumber(value.relatedPlanId) ?? null,
    startTime: getOptionalString(value.startTime) ?? null,
    title,
  };
};

export const parseAgentIntentResult = (value: unknown): AgentIntent | null => {
  if (!isRecord(value) || typeof value.intent !== "string" || !isRecord(value.args)) {
    return null;
  }

  const confidence = getConfidence(value.confidence);
  const reply = getOptionalString(value.reply);

  switch (value.intent) {
    case "answer_question": {
      const answer = getRequiredString(value.args.answer) ?? reply;

      if (!answer) {
        return null;
      }

      return {
        args: {
          answer,
          suggestAction: getOptionalString(value.args.suggestAction) ?? null,
        },
        confidence,
        intent: "answer_question",
        reply,
      };
    }
    case "create_plan": {
      const title = getRequiredString(value.args.title);

      if (!title) {
        return null;
      }

      return {
        args: {
          agentBrief: getOptionalString(value.args.agentBrief) ?? null,
          description: getOptionalString(value.args.description) ?? null,
          dueDate: getOptionalDateString(value.args.dueDate) ?? null,
          executionMode: getOptionalEnum(value.args.executionMode, executionModeValues),
          priority: getOptionalEnum(value.args.priority, planPriorityValues),
          state: getOptionalEnum(value.args.state, planStateValues),
          title,
        },
        confidence,
        intent: "create_plan",
        reply,
      };
    }
    case "append_plan_item": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);

      if (!checklistTitle || !itemTitle) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          description: getOptionalString(value.args.description) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "append_plan_item",
        reply,
      };
    }
    case "complete_plan_item": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);

      if (!checklistTitle || !itemTitle) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          completedAt: getOptionalDateString(value.args.completedAt) ?? null,
          completionNote: getOptionalString(value.args.completionNote) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "complete_plan_item",
        reply,
      };
    }
    case "add_completion_note": {
      const checklistTitle = getRequiredString(value.args.checklistTitle);
      const itemTitle = getRequiredString(value.args.itemTitle);
      const completionNote = getRequiredString(value.args.completionNote);

      if (!checklistTitle || !itemTitle || !completionNote) {
        return null;
      }

      return {
        args: {
          checklistTitle,
          completionNote,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "add_completion_note",
        reply,
      };
    }
    case "compose_plan":
      return {
        args: {
          agentBrief: getOptionalString(value.args.agentBrief) ?? null,
          goal: getOptionalString(value.args.goal) ?? null,
          keySteps: getOptionalStringArray(value.args.keySteps),
          motivation: getOptionalString(value.args.motivation) ?? null,
          nextActions: getOptionalStringArray(value.args.nextActions),
          outOfScope: getOptionalString(value.args.outOfScope) ?? null,
          proposal: parsePlanProposal(value.args.proposal),
          risks: getOptionalStringArray(value.args.risks),
          scope: getOptionalString(value.args.scope) ?? null,
          sourceText: getOptionalString(value.args.sourceText) ?? null,
          successCriteria: getOptionalStringArray(value.args.successCriteria),
          suggestedDueDate: getOptionalDateString(value.args.suggestedDueDate) ?? null,
          suggestedPriority: getOptionalEnum(value.args.suggestedPriority, planPriorityValues),
          title: getOptionalString(value.args.title) ?? null,
        },
        confidence,
        intent: "compose_plan",
        reply,
      };
    case "compose_schedule_item":
      return {
        args: {
          date: getOptionalString(value.args.date) ?? null,
          description: getOptionalString(value.args.description) ?? null,
          endTime: getOptionalString(value.args.endTime) ?? null,
          isAllDay: typeof value.args.isAllDay === "boolean" ? value.args.isAllDay : undefined,
          priority: getOptionalEnum(value.args.priority, planPriorityValues),
          proposal: parseScheduleProposal(value.args.proposal),
          reason: getOptionalString(value.args.reason) ?? null,
          relatedChecklistId: getOptionalNumber(value.args.relatedChecklistId) ?? null,
          relatedChecklistItemKey: getOptionalString(value.args.relatedChecklistItemKey) ?? null,
          relatedPlanId: getOptionalNumber(value.args.relatedPlanId) ?? null,
          sourceText: getOptionalString(value.args.sourceText) ?? null,
          sourceType: getOptionalEnum(value.args.sourceType, scheduleSourceTypeValues) ?? null,
          startTime: getOptionalString(value.args.startTime) ?? null,
          title: getOptionalString(value.args.title) ?? null,
        },
        confidence,
        intent: "compose_schedule_item",
        reply,
      };
    case "compose_timeline_event":
      return {
        args: {
          checklistTitle: getOptionalString(value.args.checklistTitle) ?? null,
          createEvent: typeof value.args.createEvent === "boolean" ? value.args.createEvent : true,
          eventDate: getOptionalDateString(value.args.eventDate) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          isFeatured: typeof value.args.isFeatured === "boolean" ? value.args.isFeatured : undefined,
          itemTitle: getOptionalString(value.args.itemTitle) ?? null,
          relatedTaskKey: getOptionalString(value.args.relatedTaskKey) ?? null,
          sourceId: getOptionalNumber(value.args.sourceId) ?? null,
          sourceText: getOptionalString(value.args.sourceText) ?? null,
          sourceTitle: getOptionalString(value.args.sourceTitle) ?? null,
          sourceType: getOptionalEnum(value.args.sourceType, timelineComposerSourceTypeValues) ?? null,
          type: getOptionalEnum(value.args.type, timelineComposerEventTypeValues) ?? null,
          visibility: getOptionalEnum(value.args.visibility, timelineComposerVisibilityValues) ?? null,
        },
        confidence,
        intent: "compose_timeline_event",
        reply,
      };
    case "query_progress":
      return {
        args: {
          checklistTitle: getOptionalString(value.args.checklistTitle) ?? null,
          scope: getOptionalEnum(value.args.scope, progressScopeValues) ?? "all",
        },
        confidence,
        intent: "query_progress",
        reply,
      };
    case "evaluate_plan":
      return {
        args: {
          planId: getOptionalNumber(value.args.planId) ?? null,
          planTitle: getOptionalString(value.args.planTitle) ?? null,
        },
        confidence,
        intent: "evaluate_plan",
        reply,
      };
    case "save_memory": {
      const content = getRequiredString(value.args.content);

      if (!content) {
        return null;
      }

      return {
        args: {
          confidence: getConfidence(value.args.confidence),
          content,
          title: getOptionalString(value.args.title) ?? null,
          type: getOptionalEnum(value.args.type, ["fact", "preference", "project_context", "workflow_rule", "writing_style"] as const),
        },
        confidence,
        intent: "save_memory",
        reply,
      };
    }
    case "weekly_review":
      return {
        args: {
          createSuggestions:
            typeof value.args.createSuggestions === "boolean" ? value.args.createSuggestions : true,
          now: getOptionalDateString(value.args.now) ?? null,
          persistReview: typeof value.args.persistReview === "boolean" ? value.args.persistReview : true,
        },
        confidence,
        intent: "weekly_review",
        reply,
      };
    case "clarify": {
      const question = getRequiredString(value.args.question) ?? reply;

      if (!question) {
        return null;
      }

      return {
        args: {
          missingFields: Array.isArray(value.args.missingFields)
            ? value.args.missingFields.filter((item): item is string => typeof item === "string" && item.length > 0)
            : [],
          question,
        },
        confidence,
        intent: "clarify",
        reply,
      };
    }
    default:
      return null;
  }
};

export const extractJSONObject = (value: string) => {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] ?? value;
  const startIndex = source.indexOf("{");
  const endIndex = source.lastIndexOf("}");

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }

  return source.slice(startIndex, endIndex + 1);
};
