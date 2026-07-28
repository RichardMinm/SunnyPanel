import { isRecord } from "@/lib/shared/is-record";
import type { ChecklistDraft } from "./planning/checklist-draft";
import type { PlanDraft } from "./planning/draft";
import type { ScheduleDraft } from "./schedule/draft";
import type { ScheduleCreationPublicPresentation } from "./schedule/public-confirmation-presentation";
import type { AgentActivityStep } from "./activity/types";
import type { AgentTraceEventPayload } from "./trace/types";
import type { ConversationalAnswerArgs, ConversationalIntentName } from "./conversation/types";
import { CONVERSATIONAL_INTENT_NAMES, isConversationalIntent } from "./conversation/types";

export { CONVERSATIONAL_INTENT_NAMES, isConversationalIntent };
export type { ConversationalAnswerArgs, ConversationalIntentName };
export type AgentChatMessage = {
  activitySteps?: AgentActivityStep[];
  content: string;
  planningChecklistDraft?: ChecklistDraft | null;
  planningDraft?: PlanDraft | null;
  role: "assistant" | "user";
  schedulingDraft?: ScheduleDraft | null;
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
  /** Capability Registry：preview 能力名（如 preview_delete_plan） */
  capability?: string;
  affectedDocuments?: Array<{
    collection: string;
    documentId?: number;
    operation: "create" | "delete" | "update";
    /** UI 展示用文档标题 */
    title?: string;
    /** Payload admin 跳转链接 */
    adminHref?: string;
    /** 公开页面跳转链接 */
    publicHref?: string;
    visibility?: AgentActionVisibility;
  }>;
  afterSnapshot?: unknown;
  beforeSnapshot?: unknown;
  changes: ProposedAgentActionChange[];
  id: string;
  intent: AgentIntent["intent"];
  requiresConfirmation?: boolean;
  riskLevel: "high" | "low" | "medium";
  publicPresentation?: {
    scheduleCreation?: ScheduleCreationPublicPresentation;
  };
  rollbackAvailable?: boolean;
  rollbackPayload?: unknown;
  summary: string;
  toolName?: string;
};

/**
 * Union of all tool intent names recognized by the Agent.
 *
 * NOTE — naming debt: despite the type name "AgentWriteIntentName", this union
 * includes read-only tools (query_plan_progress, query_schedule) and draft tools
 * (compose_plan, compose_schedule_item, compose_timeline_event). They are included
 * here only for compatibility with the existing intent/executor type system.
 *
 * Read tools MUST remain read-only:
 *  - no pendingAction
 *  - no Policy Guard
 *  - no execute / DB write / receipt / rollback
 *
 * TODO(R5-D): rename to AgentToolIntentName and split into:
 *   AgentReadIntentName  | AgentDraftIntentName | AgentWriteIntentName
 */
export type AgentWriteIntentName =
  | "add_completion_note"
  | "append_plan_item"
  | "cancel_schedule_item"
  | "complete_plan_item"
  | "create_checklist"
  | "create_schedule_items"
  | "compose_checklist"
  | "compose_plan"
  | "compose_schedule_item"
  | "compose_timeline_event"
  | "create_plan"
  | "delete_record"
  | "modify_record"
  | "query_plan_progress"
  | "query_schedule"
  | "reschedule_item"
  | "save_memory"
  | "schedule_plan"
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
  action?: ProposedAgentAction;
  type: "bypass";
};

export type AgentDryRunResult =
  | AgentDryRunBypassResult
  | AgentDryRunClarifyResult
  | AgentDryRunProposedActionResult;

export type AgentQueueResumeTask = {
  agentRole: "content" | "memory" | "plan" | "query" | "review" | "schedule";
  args: Record<string, unknown>;
  dependsOn: string[];
  id: string;
  intent: AgentIntent["intent"];
  label: string;
};

export type AgentQueueResumePendingAction = {
  completedTaskIds: string[];
  deferredTaskIds: string[];
  mode: "compound" | "single";
  orchestrationId?: string;
  originalMessage: string;
  reasoning: string;
  tasks: AgentQueueResumeTask[];
  type: "await_queue_resume";
};

export type AgentStrategyResumePendingAction = {
  failedTaskId?: string;
  failureReason: string;
  mode: "compound" | "single";
  orchestrationId?: string;
  originalMessage: string;
  reason: string;
  reasoning: string;
  recentRunIds: number[];
  strategyMode: string;
  tasks: AgentQueueResumeTask[];
  type: "await_strategy_resume";
};

export type AgentLearningProfile = {
  baseline?: string;
  dailyTime?: string;
  deadline?: string;
  goal?: string;
};

export type AgentLearningFollowupPendingAction = {
  originalMessage: string;
  profile?: AgentLearningProfile;
  requestedAction?: "compose_plan";
  subject: string;
  type: "await_learning_followup";
};

export type PendingAction = {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
  type: "await_completion_note";
} | {
  action: ProposedAgentAction;
  deferredActions?: ProposedAgentAction[];
  orchestrationId?: string;
  resumeQueue?: AgentQueueResumePendingAction;
  type: "await_confirmation";
} | {
  actions: ProposedAgentAction[];
  orchestrationId?: string;
  resumeQueue?: AgentQueueResumePendingAction;
  type: "await_batch_confirmation";
} | AgentQueueResumePendingAction | AgentStrategyResumePendingAction | AgentLearningFollowupPendingAction | {
  args: Partial<
    | AddCompletionNoteArgs
    | AppendPlanItemArgs
    | CancelScheduleItemArgs
    | CompletePlanItemArgs
    | ComposeChecklistArgs
    | ComposePlanArgs
    | ComposeScheduleItemArgs
    | CreateScheduleItemsArgs
    | CreateChecklistArgs
    | CreatePlanArgs
    | DeleteRecordArgs
    | ModifyRecordArgs
    | QueryPlanProgressArgs
    | QueryScheduleArgs
    | RescheduleItemArgs
    | SaveMemoryArgs
    | SchedulePlanArgs
  >;
  intent: Extract<
    AgentIntent["intent"],
    | "add_completion_note"
    | "append_plan_item"
    | "cancel_schedule_item"
    | "complete_plan_item"
    | "compose_plan"
    | "compose_schedule_item"
    | "create_schedule_items"
    | "create_checklist"
    | "create_plan"
    | "query_plan_progress"
    | "reschedule_item"
    | "save_memory"
    | "schedule_plan"
    | "delete_record"
    | "modify_record"
  >;
  missingFields: string[];
  originalMessage?: string;
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

export type CreateChecklistItemArgs = {
  description: null | string;
  isCompleted: boolean;
  title: string;
};

export type CreateChecklistGroupArgs = {
  items: CreateChecklistItemArgs[];
  title: string;
};

export type CreateChecklistArgs = {
  groups: CreateChecklistGroupArgs[];
  sourcePlanId?: null | number;
  sourceText?: null | string;
  status?: "draft" | "published";
  summary?: null | string;
  title: string;
  visibility?: "private" | "public";
};

export type AppendPlanItemArgs = {
  checklistTitle: string;
  createGroupIfMissing?: boolean;
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
  learningContext?: null | {
    originalMessage: string;
    profile?: AgentLearningProfile;
    requestedAction?: "compose_plan";
    subject: string;
  };
  /** 开放域主题：answer 为空时由 LLM 生成，不走 curated 模板。 */
  openDomainTopic?: null | string;
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
  /** LLM 拆解的阶段计划结果。随 PendingAction 持久化以在确认后继续使用。 */
  decomposed?: null | import("./workflows/plan-decomposer").DecomposedPlan;
  domain?: string;
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

export type CreateScheduleItemsArgs = {
  title?: string;
  sourceType?: "plan" | "checklist" | "manual";
  sourcePlanId?: null | number;
  sourceChecklistId?: null | number;
  conflictPolicy?: "allow-overlap" | "ask" | "reschedule" | "skip" | null;
  items: Array<{
    title: string;
    description?: null | string;
    date: string;
    startTime?: null | string;
    endTime?: null | string;
    isAllDay?: boolean | null;
    priority?: null | PlanPriorityValue;
    relatedPlanId?: null | number;
    relatedChecklistId?: null | number;
    relatedChecklistItemKey?: null | string;
    conflictNote?: null | string;
    sourceTaskTitle?: null | string;
  }>;
  sourceText?: null | string;
};

export type SchedulePlanArgs = {
  planId: number;
  defaultDurationMinutes?: number;
  defaultStartTime?: null | string;
  startDate?: null | string;
};

export type RescheduleItemArgs = {
  itemId: number;
  newDate?: null | string;
  newEndTime?: null | string;
  newStartTime?: null | string;
  newTitle?: null | string;
  reason?: null | string;
};

export type CancelScheduleItemArgs = {
  itemId: number;
  reason?: null | string;
};

export type PlanRecordPatch = {
  description?: null | string;
  domain?: "creative" | "fitness" | "other" | "study" | "travel" | "work";
  dueDate?: null | string;
  executionMode?: "agent" | "hybrid" | "manual";
  priority?: "high" | "low" | "medium";
  startDate?: null | string;
  state?: "active" | "backlog" | "done" | "paused";
  status?: "draft" | "published";
  title?: string;
  visibility?: "private" | "public";
};

export type ScheduleRecordPatch = {
  category?: "agent" | "course" | "default" | "exam" | "plan_action" | "study";
  date?: string;
  description?: null | string;
  endTime?: null | string;
  isAllDay?: boolean;
  priority?: "high" | "low" | "medium";
  startTime?: null | string;
  status?: "canceled" | "done" | "planned" | "skipped";
  title?: string;
};

export type ChecklistRecordPatch = {
  publishedAt?: null | string;
  status?: "draft" | "published";
  summary?: null | string;
  title?: string;
  visibility?: "private" | "public";
};

export type TimelineRecordPatch = {
  description?: null | string;
  eventDate?: string;
  isFeatured?: boolean;
  sortOrder?: number;
  status?: "draft" | "published";
  title?: string;
  type?: "agent" | "exam" | "life" | "milestone" | "project" | "study";
  visibility?: "private" | "public";
};

type ModifyRecordBaseArgs = {
  /** 自然语言描述的修改字段和值 */
  changeDescription: string;
  /** 要修改的目标实体名称 */
  entityName: string;
  /** dry-run 唯一定位后固化的目标 ID */
  targetId?: null | number;
};

export type ModifyRecordArgs =
  | (ModifyRecordBaseArgs & {
      entityType: "checklist";
      patch?: ChecklistRecordPatch | null;
    })
  | (ModifyRecordBaseArgs & {
      entityType: "plan";
      patch?: PlanRecordPatch | null;
    })
  | (ModifyRecordBaseArgs & {
      entityType: "schedule";
      patch?: ScheduleRecordPatch | null;
    })
  | (ModifyRecordBaseArgs & {
      entityType: "timeline";
      patch?: TimelineRecordPatch | null;
    });

export type DeleteRecordArgs = {
  /** 要删除的目标实体名称 */
  entityName: string;
  /** 实体类型 */
  entityType: "checklist" | "plan" | "schedule" | "timeline";
  /** dry-run 唯一定位后固化的目标 ID */
  targetId?: null | number;
};

export type QueryPlanProgressArgs = {
  planId?: null | number;
  planTitle?: null | string;
};

export type ComposeChecklistArgs = {
  goal?: null | string;
  items?: Array<{
    description?: null | string;
    priority?: null | "high" | "low" | "medium";
    title: string;
  }>;
  title?: null | string;
};

export type QueryScheduleArgs = {
  endDate?: null | string;
  limit?: null | number;
  range?: null | "next_week" | "this_week" | "today" | "tomorrow" | "upcoming";
  startDate?: null | string;
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
      args: ComposeChecklistArgs;
      confidence?: number;
      intent: "compose_checklist";
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
      args: CreateChecklistArgs;
      confidence?: number;
      intent: "create_checklist";
      reply?: string;
    }
  | {
      args: CreateScheduleItemsArgs;
      confidence?: number;
      intent: "create_schedule_items";
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
      args: QueryPlanProgressArgs;
      confidence?: number;
      intent: "query_plan_progress";
      reply?: string;
    }
  | {
      args: QueryScheduleArgs;
      confidence?: number;
      intent: "query_schedule";
      reply?: string;
    }
  | {
      args: SaveMemoryArgs;
      confidence?: number;
      intent: "save_memory";
      reply?: string;
    }
  | {
      args: SchedulePlanArgs;
      confidence?: number;
      intent: "schedule_plan";
      reply?: string;
    }
  | {
      args: RescheduleItemArgs;
      confidence?: number;
      intent: "reschedule_item";
      reply?: string;
    }
  | {
      args: CancelScheduleItemArgs;
      confidence?: number;
      intent: "cancel_schedule_item";
      reply?: string;
    }
  | {
      args: WeeklyReviewArgs;
      confidence?: number;
      intent: "weekly_review";
      reply?: string;
    }
  | {
      args: ModifyRecordArgs;
      confidence?: number;
      intent: "modify_record";
      reply?: string;
    }
  | {
      args: DeleteRecordArgs;
      confidence?: number;
      intent: "delete_record";
      reply?: string;
    }
  | {
      args: AnswerQuestionArgs;
      confidence?: number;
      intent: "capability_query";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_checklist_progress";
      reply?: string;
    }
  | {
      args: AnswerQuestionArgs;
      confidence?: number;
      intent: "query_memory";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_plan";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_schedule";
      reply?: string;
    }
  | {
      args: QueryProgressArgs;
      confidence?: number;
      intent: "query_timeline";
      reply?: string;
    }
  | {
      args: ConversationalAnswerArgs;
      confidence?: number;
      intent: ConversationalIntentName;
      reply?: string;
    };

export type ReadOnlyAgentIntent = Extract<
  AgentIntent,
  { intent: "answer_question" | "capability_query" | "clarify" | "evaluate_plan" | "query_checklist_progress" | "query_memory" | "query_plan" | "query_plan_progress" | "query_progress" | "query_schedule" | "query_timeline" | ConversationalIntentName }
>;

export type AgentEngine = "glm" | "heuristic" | "model" | "openai" | "openai-compatible" | "workflow" | "zai";

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
  activitySteps?: AgentActivityStep[];
  affectedDocuments?: import("./tool-shared").AffectedDocumentSummary[];
  assistantMessage: string;
  /** 后端结构化 trace，供 Inspector / Ops debug 展示；已脱敏，不承载 raw prompt/response。 */
  backendTraceEvents?: AgentTraceEventPayload[];
  confidence?: number;
  engine: AgentEngine;
  intent: AgentIntent["intent"];
  /** Server-internal receipt evidence. Public JSON/SSE projection always strips this field. */
  lastRollbackPayload?: unknown;
  /** Public bounded reference to the owned AgentRun containing rollback evidence. */
  lastRollbackSourceRunId?: number;
  pendingAction: null | PendingAction;
  /** 清单草案仅用于前端 artifact 展示，不代表已写入 Checklists collection。 */
  planningChecklistDraft?: ChecklistDraft | null;
  /** 计划草案仅用于前端 artifact 展示，不代表已写入 Plans collection。 */
  planningDraft?: PlanDraft | null;
  /** 日程草案仅用于前端 artifact 展示，不代表已写入 Schedule collection。 */
  schedulingDraft?: ScheduleDraft | null;
  trace?: AgentTraceStep[];
  /** 结构化回合审计（Router / Policy / Tools）。 */
  turnAudit?: import("./trace/agent-turn-trace").AgentTurnTrace;
  /** 性能追踪数据（开启 AGENT_PERF_TRACE=1 时填充）。 */
  perfTrace?: import("./trace/perf-trace").AgentPerformanceTrace | import("./trace/perf-trace").AgentPerformanceTraceSummary;
  threadId?: number;
  tokenUsage?: AgentTokenUsage;
  /** 客户端或服务端生成的幂等回合标识。 */
  turnId?: string;
  /** 服务端回传的工作台模式，供日志和 UI 可观测。 */
  workbenchMode?: string;
  /** 本轮上下文摘要，供 StatusBar 展示。 */
  contextSummary?: string;
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
const contentStatusValues = ["draft", "published"] as const;
const visibilityValues = ["private", "public"] as const;
const planDomainValues = ["creative", "fitness", "other", "study", "travel", "work"] as const;
const scheduleCategoryValues = ["agent", "course", "default", "exam", "plan_action", "study"] as const;
const scheduleStatusValues = ["canceled", "done", "planned", "skipped"] as const;
const timelineEventTypeValues = ["agent", "exam", "life", "milestone", "project", "study"] as const;
const agentRoleValues = ["content", "memory", "plan", "query", "review", "schedule"] as const;
const agentIntentValues = [
  "add_completion_note",
  "answer_question",
  "append_plan_item",
  "cancel_schedule_item",
  "capability_query",
  "clarify",
  "delete_record",
  "modify_record",
  "complete_plan_item",
  "compose_checklist",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_checklist",
  "create_plan",
  "create_schedule_items",
  "evaluate_plan",
  "query_checklist_progress",
  "query_memory",
  "query_plan",
  "query_progress",
  "query_plan_progress",
  "query_schedule",
  "query_timeline",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
] as const;
const proposedActionRiskValues = ["high", "low", "medium"] as const;
const proposedActionOperationValues = ["create", "delete", "update"] as const;
const proposedActionVisibilityValues = ["private", "public", "unknown"] as const;


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

const getOptionalNullableString = (value: unknown) =>
  value === null ? null : getOptionalString(value);

const getOptionalNullableDateString = (value: unknown) =>
  value === null ? null : getOptionalDateString(value);

const compactRecord = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;

const parseModifyRecordPatch = (
  entityType: ModifyRecordArgs["entityType"],
  value: unknown,
): ModifyRecordArgs["patch"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (entityType === "plan") {
    return compactRecord({
      agentBrief: getOptionalNullableString(value.agentBrief),
      description: getOptionalNullableString(value.description),
      domain: getOptionalEnum(value.domain, planDomainValues),
      dueDate: getOptionalNullableDateString(value.dueDate),
      executionMode: getOptionalEnum(value.executionMode, executionModeValues),
      priority: getOptionalEnum(value.priority, planPriorityValues),
      startDate: getOptionalNullableDateString(value.startDate),
      state: getOptionalEnum(value.state, planStateValues),
      status: getOptionalEnum(value.status, contentStatusValues),
      title: getOptionalString(value.title),
      visibility: getOptionalEnum(value.visibility, visibilityValues),
    });
  }

  if (entityType === "schedule") {
    return compactRecord({
      agentBrief: getOptionalNullableString(value.agentBrief),
      category: getOptionalEnum(value.category, scheduleCategoryValues),
      date: getOptionalDateString(value.date),
      description: getOptionalNullableString(value.description),
      endTime: getOptionalNullableString(value.endTime),
      isAllDay: typeof value.isAllDay === "boolean" ? value.isAllDay : undefined,
      priority: getOptionalEnum(value.priority, planPriorityValues),
      startTime: getOptionalNullableString(value.startTime),
      status: getOptionalEnum(value.status, scheduleStatusValues),
      title: getOptionalString(value.title),
    });
  }

  if (entityType === "checklist") {
    return compactRecord({
      publishedAt: getOptionalNullableDateString(value.publishedAt),
      status: getOptionalEnum(value.status, contentStatusValues),
      summary: getOptionalNullableString(value.summary),
      title: getOptionalString(value.title),
      visibility: getOptionalEnum(value.visibility, visibilityValues),
    });
  }

  return compactRecord({
    description: getOptionalNullableString(value.description),
    eventDate: getOptionalDateString(value.eventDate),
    isFeatured: typeof value.isFeatured === "boolean" ? value.isFeatured : undefined,
    sortOrder: getOptionalNumber(value.sortOrder),
    status: getOptionalEnum(value.status, contentStatusValues),
    title: getOptionalString(value.title),
    type: getOptionalEnum(value.type, timelineEventTypeValues),
    visibility: getOptionalEnum(value.visibility, visibilityValues),
  });
};

const getOptionalStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => getOptionalString(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 12)
    : undefined;

const getOptionalNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => getOptionalNumber(item))
        .filter((item): item is number => typeof item === "number")
        .slice(0, 12)
    : undefined;

const parseCreateChecklistGroups = (value: unknown): CreateChecklistGroupArgs[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const groups = value
    .map((group) => {
      if (!isRecord(group)) {
        return null;
      }

      const title = getRequiredString(group.title);
      if (!title || !Array.isArray(group.items)) {
        return null;
      }

      const items = group.items
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }

          const itemTitle = getRequiredString(item.title);
          if (!itemTitle) {
            return null;
          }

          return {
            description: getOptionalString(item.description) ?? null,
            isCompleted: typeof item.isCompleted === "boolean" ? item.isCompleted : false,
            title: itemTitle,
          } satisfies CreateChecklistItemArgs;
        })
        .filter((item): item is CreateChecklistItemArgs => Boolean(item));

      if (items.length === 0) {
        return null;
      }

      return {
        items,
        title,
      } satisfies CreateChecklistGroupArgs;
    })
    .filter((group): group is CreateChecklistGroupArgs => Boolean(group));

  return groups.length > 0 ? groups : null;
};

const parseCreateScheduleItems = (value: unknown): CreateScheduleItemsArgs["items"] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: CreateScheduleItemsArgs["items"] = [];

  for (const item of value.slice(0, 24)) {
    if (!isRecord(item)) {
      continue;
    }

    const title = getRequiredString(item.title);
    const date = getRequiredString(item.date);

    if (!title || !date) {
      continue;
    }

    items.push({
      conflictNote: getOptionalString(item.conflictNote) ?? null,
      date,
      description: getOptionalString(item.description) ?? null,
      endTime: getOptionalString(item.endTime) ?? null,
      isAllDay: typeof item.isAllDay === "boolean" ? item.isAllDay : null,
      priority: getOptionalEnum(item.priority, planPriorityValues) ?? null,
      relatedChecklistId: getOptionalNumber(item.relatedChecklistId) ?? null,
      relatedChecklistItemKey: getOptionalString(item.relatedChecklistItemKey) ?? null,
      relatedPlanId: getOptionalNumber(item.relatedPlanId) ?? null,
      sourceTaskTitle: getOptionalString(item.sourceTaskTitle) ?? null,
      startTime: getOptionalString(item.startTime) ?? null,
      title,
    });
  }

  return items.length > 0 ? items : null;
};

const parseLearningProfile = (value: unknown): AgentLearningProfile | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const profile: AgentLearningProfile = {
    baseline: getOptionalString(value.baseline),
    dailyTime: getOptionalString(value.dailyTime),
    deadline: getOptionalString(value.deadline),
    goal: getOptionalString(value.goal),
  };

  return Object.values(profile).some(Boolean) ? profile : undefined;
};

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

const parseQueueResumeTask = (value: unknown): null | AgentQueueResumeTask => {
  if (!isRecord(value)) {
    return null;
  }

  const agentRole = getOptionalEnum(value.agentRole, agentRoleValues);
  const id = getRequiredString(value.id);
  const intent = getOptionalEnum(value.intent, agentIntentValues);
  const label = getRequiredString(value.label);

  if (!agentRole || !id || !intent || !label) {
    return null;
  }

  return {
    agentRole,
    args: isRecord(value.args) ? value.args : {},
    dependsOn: Array.isArray(value.dependsOn)
      ? value.dependsOn.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    id,
    intent,
    label,
  };
};

const parseQueueResumePendingAction = (value: unknown): null | AgentQueueResumePendingAction => {
  if (!isRecord(value) || value.type !== "await_queue_resume") {
    return null;
  }

  const originalMessage = getRequiredString(value.originalMessage);
  const mode = getOptionalEnum(value.mode, ["compound", "single"] as const) ?? "compound";
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((item) => parseQueueResumeTask(item)).filter((item): item is AgentQueueResumeTask => item !== null)
    : [];
  const deferredTaskIds = Array.isArray(value.deferredTaskIds)
    ? value.deferredTaskIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

  if (!originalMessage || tasks.length === 0 || deferredTaskIds.length === 0) {
    return null;
  }

  return {
    completedTaskIds: Array.isArray(value.completedTaskIds)
      ? value.completedTaskIds.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    deferredTaskIds,
    mode,
    orchestrationId: getOptionalString(value.orchestrationId) ?? undefined,
    originalMessage,
    reasoning: getOptionalString(value.reasoning) ?? "",
    tasks,
    type: "await_queue_resume",
  };
};

const parseStrategyResumePendingAction = (value: unknown): null | AgentStrategyResumePendingAction => {
  if (!isRecord(value) || value.type !== "await_strategy_resume") {
    return null;
  }

  const originalMessage = getRequiredString(value.originalMessage);
  const failureReason = getRequiredString(value.failureReason);
  const reason = getRequiredString(value.reason);
  const mode = getOptionalEnum(value.mode, ["compound", "single"] as const) ?? "compound";
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((item) => parseQueueResumeTask(item)).filter((item): item is AgentQueueResumeTask => item !== null)
    : [];

  if (!originalMessage || !failureReason || !reason || tasks.length === 0) {
    return null;
  }

  return {
    failedTaskId: getOptionalString(value.failedTaskId) ?? undefined,
    failureReason,
    mode,
    orchestrationId: getOptionalString(value.orchestrationId) ?? undefined,
    originalMessage,
    reason,
    reasoning: getOptionalString(value.reasoning) ?? "",
    recentRunIds: getOptionalNumberArray(value.recentRunIds) ?? [],
    strategyMode: getOptionalString(value.strategyMode) ?? "neutral",
    tasks,
    type: "await_strategy_resume",
  };
};

export const parsePendingAction = (value: unknown): null | PendingAction => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "await_queue_resume") {
    return parseQueueResumePendingAction(value);
  }

  if (value.type === "await_strategy_resume") {
    return parseStrategyResumePendingAction(value);
  }

  if (value.type === "await_learning_followup") {
    const subject = getRequiredString(value.subject);
    const originalMessage = getRequiredString(value.originalMessage);

    if (!subject || !originalMessage) {
      return null;
    }

    return {
      originalMessage,
      profile: parseLearningProfile(value.profile),
      requestedAction: value.requestedAction === "compose_plan" ? "compose_plan" : undefined,
      subject,
      type: "await_learning_followup",
    };
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

    const deferredActions = Array.isArray(value.deferredActions)
      ? value.deferredActions
          .map((item) => parseProposedAgentAction(item))
          .filter((item): item is ProposedAgentAction => item !== null)
      : undefined;

    return {
      action,
      deferredActions: deferredActions && deferredActions.length > 0 ? deferredActions : undefined,
      orchestrationId: getOptionalString(value.orchestrationId) ?? undefined,
      resumeQueue: parseQueueResumePendingAction(value.resumeQueue) ?? undefined,
      type: "await_confirmation",
    };
  }

  if (value.type === "await_batch_confirmation") {
    if (!Array.isArray(value.actions)) {
      return null;
    }

    const actions = value.actions
      .map((item) => parseProposedAgentAction(item))
      .filter((action): action is ProposedAgentAction => action !== null);

    if (actions.length === 0) {
      return null;
    }

    return {
      actions,
      orchestrationId: getOptionalString(value.orchestrationId) ?? undefined,
      resumeQueue: parseQueueResumePendingAction(value.resumeQueue) ?? undefined,
      type: "await_batch_confirmation",
    };
  }

  if (value.type !== "await_clarification" || !isRecord(value.args)) {
    return null;
  }

  const question = getRequiredString(value.question);
  const intent =
    value.intent === "add_completion_note" ||
    value.intent === "append_plan_item" ||
    value.intent === "cancel_schedule_item" ||
    value.intent === "complete_plan_item" ||
    value.intent === "compose_plan" ||
    value.intent === "compose_schedule_item" ||
    value.intent === "create_checklist" ||
    value.intent === "create_plan" ||
    value.intent === "create_schedule_items" ||
    value.intent === "reschedule_item" ||
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
      | ComposeChecklistArgs
      | ComposePlanArgs
      | ComposeScheduleItemArgs
      | CreateChecklistArgs
      | CreatePlanArgs
      | CreateScheduleItemsArgs
      | SaveMemoryArgs
    >,
    intent,
    missingFields: Array.isArray(value.missingFields)
      ? value.missingFields.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    originalMessage: getOptionalString(value.originalMessage) ?? undefined,
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
          const title = getOptionalString(item.title);
          const adminHref = getOptionalString(item.adminHref);
          const publicHref = getOptionalString(item.publicHref);

          if (!collection || !operation) {
            return null;
          }

          return {
            collection,
            ...(documentId ? { documentId } : {}),
            operation,
            ...(title ? { title } : {}),
            ...(adminHref ? { adminHref } : {}),
            ...(publicHref ? { publicHref } : {}),
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
    ...(typeof value.capability === "string" ? { capability: value.capability } : {}),
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

const parseComposeChecklistItems = (
  value: unknown,
): ComposeChecklistArgs["items"] => {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = getRequiredString(item.title);
    if (!title) return [];
    return [{
      description: getOptionalString(item.description) ?? null,
      priority: getOptionalEnum(
        item.priority,
        ["high", "low", "medium"] as const,
      ) ?? null,
      title,
    }];
  });
};

export const parseAgentIntentResult = (value: unknown): AgentIntent | null => {
  // 兼容主 prompt 的仲裁包装 {decision, intent:{...}}：当 intent 字段本身是对象时解包内层意图，
  // 使主链路与子 Agent（输出扁平 intent）共用一套解析，避免编排链路因格式漂移而丢意图。
  if (isRecord(value) && isRecord(value.intent)) {
    return parseAgentIntentResult(value.intent);
  }

  if (!isRecord(value) || typeof value.intent !== "string" || !isRecord(value.args)) {
    return null;
  }

  const confidence = getConfidence(value.confidence);
  const reply = getOptionalString(value.reply);

  switch (value.intent) {
    case "answer_question": {
      const answer = getRequiredString(value.args.answer) ?? reply;
      const learningContext = isRecord(value.args.learningContext)
        ? {
            originalMessage: getRequiredString(value.args.learningContext.originalMessage) ?? "",
            profile: parseLearningProfile(value.args.learningContext.profile),
            requestedAction:
              value.args.learningContext.requestedAction === "compose_plan" ? "compose_plan" as const : undefined,
            subject: getRequiredString(value.args.learningContext.subject) ?? "",
          }
        : null;

      if (!answer) {
        return null;
      }

      return {
        args: {
          answer,
          learningContext:
            learningContext?.originalMessage && learningContext.subject
              ? learningContext
              : null,
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
          createGroupIfMissing: typeof value.args.createGroupIfMissing === "boolean" ? value.args.createGroupIfMissing : undefined,
          description: getOptionalString(value.args.description) ?? null,
          groupTitle: getOptionalString(value.args.groupTitle) ?? null,
          itemTitle,
        },
        confidence,
        intent: "append_plan_item",
        reply,
      };
    }
    case "complete_checklist_item":
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
        // complete_checklist_item is the public semantic alias; keep the persisted
        // tool intent stable so existing AgentThread enums and pending actions stay compatible.
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
    case "compose_checklist":
      return {
        args: {
          goal: getOptionalString(value.args.goal) ?? null,
          items: parseComposeChecklistItems(value.args.items),
          title: getOptionalString(value.args.title) ?? null,
        },
        confidence,
        intent: "compose_checklist",
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
    case "create_checklist": {
      const title = getRequiredString(value.args.title);
      const groups = parseCreateChecklistGroups(value.args.groups);

      if (!title || !groups) {
        return null;
      }

      return {
        args: {
          groups,
          sourcePlanId: getOptionalNumber(value.args.sourcePlanId) ?? null,
          sourceText: getOptionalString(value.args.sourceText) ?? null,
          status: getOptionalEnum(value.args.status, contentStatusValues),
          summary: getOptionalString(value.args.summary) ?? null,
          title,
          visibility: getOptionalEnum(value.args.visibility, visibilityValues),
        },
        confidence,
        intent: "create_checklist",
        reply,
      };
    }
    case "create_schedule_items": {
      const items = parseCreateScheduleItems(value.args.items);

      if (!items) {
        return null;
      }

      return {
        args: {
          conflictPolicy: getOptionalEnum(value.args.conflictPolicy, ["ask", "skip", "allow-overlap", "reschedule"] as const) ?? null,
          items,
          sourceChecklistId: getOptionalNumber(value.args.sourceChecklistId) ?? null,
          sourcePlanId: getOptionalNumber(value.args.sourcePlanId) ?? null,
          sourceText: getOptionalString(value.args.sourceText) ?? null,
          sourceType: getOptionalEnum(value.args.sourceType, ["plan", "checklist", "manual"] as const),
          title: getOptionalString(value.args.title) ?? undefined,
        },
        confidence,
        intent: "create_schedule_items",
        reply,
      };
    }
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
    case "query_checklist_progress":
      return {
        args: {
          checklistTitle: getOptionalString(value.args.checklistTitle) ?? null,
          scope: "checklists",
        },
        confidence,
        intent: "query_checklist_progress",
        reply,
      };
    case "query_memory":
      return {
        args: {
          answer: getOptionalString(value.args.answer) ?? "",
          learningContext: null,
          openDomainTopic: null,
          suggestAction: null,
        },
        confidence,
        intent: "query_memory",
        reply,
      };
    case "query_plan":
      return {
        args: {
          checklistTitle: getOptionalString(value.args.checklistTitle) ?? null,
          scope: "plans",
        },
        confidence,
        intent: "query_plan",
        reply,
      };
    case "query_plan_progress": {
      const planId = getOptionalNumber(value.args.planId);
      const planTitle = getOptionalString(value.args.planTitle);

      if ((!planId || planId <= 0 || !Number.isInteger(planId)) && !planTitle) {
        return null;
      }

      return {
        args: {
          planId: planId && planId > 0 && Number.isInteger(planId) ? planId : null,
          planTitle: planTitle ?? null,
        },
        confidence,
        intent: "query_plan_progress",
        reply,
      };
    }
    case "query_schedule": {
      const limit = getOptionalNumber(value.args.limit);
      return {
        args: {
          endDate: getOptionalDateString(value.args.endDate) ?? null,
          limit:
            limit && limit > 0 && Number.isInteger(limit) ? limit : null,
          range: getOptionalEnum(
            value.args.range,
            ["next_week", "this_week", "today", "tomorrow", "upcoming"] as const,
          ) ?? null,
          startDate: getOptionalDateString(value.args.startDate) ?? null,
        },
        confidence,
        intent: "query_schedule",
        reply,
      };
    }
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
    case "schedule_plan": {
      const planId = getOptionalNumber(value.args.planId);

      if (!planId) {
        return null;
      }

      return {
        args: {
          defaultDurationMinutes: getOptionalNumber(value.args.defaultDurationMinutes),
          defaultStartTime: getOptionalString(value.args.defaultStartTime) ?? null,
          planId,
          startDate: getOptionalDateString(value.args.startDate) ?? null,
        },
        confidence,
        intent: "schedule_plan",
        reply,
      };
    }
    case "delete_record": {
      const entityName = getRequiredString(value.args.entityName);
      const entityType = getOptionalEnum(
        value.args.entityType,
        ["checklist", "plan", "schedule", "timeline"] as const,
      );

      if (!entityName || !entityType) {
        return null;
      }

      return {
        args: {
          entityName,
          entityType,
          targetId: getOptionalNumber(value.args.targetId) ?? null,
        },
        confidence,
        intent: "delete_record",
        reply,
      };
    }
    case "reschedule_item": {
      const rescheduleItemId = getOptionalNumber(value.args.itemId);
      if (!rescheduleItemId) return null;
      return {
        args: {
          itemId: rescheduleItemId,
          newDate: getOptionalDateString(value.args.newDate) ?? null,
          newEndTime: getOptionalString(value.args.newEndTime) ?? null,
          newStartTime: getOptionalString(value.args.newStartTime) ?? null,
          newTitle: getOptionalString(value.args.newTitle) ?? null,
          reason: getOptionalString(value.args.reason) ?? null,
        },
        confidence,
        intent: "reschedule_item",
        reply,
      };
    }
    case "cancel_schedule_item": {
      const cancelItemId = getOptionalNumber(value.args.itemId);
      if (!cancelItemId) return null;
      return {
        args: {
          itemId: cancelItemId,
          reason: getOptionalString(value.args.reason) ?? null,
        },
        confidence,
        intent: "cancel_schedule_item",
        reply,
      };
    }
    case "modify_record": {
      const entityName = getRequiredString(value.args.entityName);
      const changeDescription = getRequiredString(value.args.changeDescription);
      const entityType = getOptionalEnum(
        value.args.entityType,
        ["checklist", "plan", "schedule", "timeline"] as const,
      );

      if (!entityName || !changeDescription || !entityType) {
        return null;
      }

      const baseArgs = {
        changeDescription,
        entityName,
        patch: parseModifyRecordPatch(entityType, value.args.patch),
        targetId: getOptionalNumber(value.args.targetId) ?? null,
      };

      if (entityType === "checklist") {
        return {
          args: { ...baseArgs, entityType, patch: baseArgs.patch as ChecklistRecordPatch | null },
          confidence,
          intent: "modify_record",
          reply,
        };
      }

      if (entityType === "plan") {
        return {
          args: { ...baseArgs, entityType, patch: baseArgs.patch as PlanRecordPatch | null },
          confidence,
          intent: "modify_record",
          reply,
        };
      }

      if (entityType === "schedule") {
        return {
          args: { ...baseArgs, entityType, patch: baseArgs.patch as ScheduleRecordPatch | null },
          confidence,
          intent: "modify_record",
          reply,
        };
      }

      return {
        args: { ...baseArgs, entityType, patch: baseArgs.patch as TimelineRecordPatch | null },
        confidence,
        intent: "modify_record",
        reply,
      };
    }
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
    default: {
      if (!(CONVERSATIONAL_INTENT_NAMES as readonly string[]).includes(value.intent)) {
        return null;
      }

      const answer = getRequiredString(value.args.answer) ?? reply;
      const topic = getRequiredString(value.args.topic);

      if (!answer || !topic) {
        return null;
      }

      const learningContext = isRecord(value.args.learningContext)
        ? {
            originalMessage: getRequiredString(value.args.learningContext.originalMessage) ?? "",
            subject: getRequiredString(value.args.learningContext.subject) ?? topic,
          }
        : null;

      return {
        args: {
          answer,
          learningContext:
            learningContext?.originalMessage && learningContext.subject ? learningContext : null,
          requiresConfirmation: false,
          riskLevel: "none" as const,
          suggestAction: getOptionalString(value.args.suggestAction) ?? null,
          target:
            value.args.target === "last_topic" || typeof value.args.target === "string"
              ? (value.args.target as ConversationalAnswerArgs["target"])
              : "last_topic",
          topic,
          writeRequired: false,
        },
        confidence,
        intent: value.intent as ConversationalIntentName,
        reply,
      };
    }
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
