import type {
  AddCompletionNoteArgs,
  AgentDryRunClarifyResult,
  AgentDryRunProposedActionResult,
  AgentIntent,
  AgentTraceStep,
  AgentWriteIntentName,
  AppendPlanItemArgs,
  CancelScheduleItemArgs,
  CompletePlanItemArgs,
  ComposeChecklistArgs,
  ComposePlanArgs,
  ComposeScheduleItemArgs,
  ComposeTimelineEventArgs,
  CreateChecklistArgs,
  CreatePlanArgs,
  CreateScheduleItemsArgs,
  DeleteRecordArgs,
  ModifyRecordArgs,
  ProposedAgentAction,
  QueryPlanProgressArgs,
  QueryScheduleArgs,
  RescheduleItemArgs,
  ScheduleConflict,
  SchedulePlanArgs,
  SaveMemoryArgs,
  WeeklyReviewArgs,
} from "./schemas";
import type { AgentToolResult } from "./tool-shared";
export type { AgentToolResult } from "./tool-shared";
import { parseAgentMemoryInput } from "./memory-schema";
import {
  composePlanProposal,
  composePlanProposalFromDecomposed,
  formatPlanProposalDescription,
  isPlanComposerInputAmbiguous,
} from "./workflows/plan-composer";
import { decomposePlanRuleBased, inferDomain, normalizeComposePlanArgs, parsePlanSeedFromText } from "./workflows/plan-seed";
import type { AgentPromptContext } from "./prompts";
import {
  composeScheduleProposalAsync,
  isScheduleComposerDateAmbiguous,
  toScheduleConflicts,
  type ScheduleComposerContext,
} from "./workflows/schedule-composer";
import {
  buildScheduleConflictSummary,
  detectScheduleConflictsForItems,
  formatScheduleConflictLines,
  getCreateScheduleItemsConflictPolicy,
  scheduleConflictFromExistingMatch,
  shouldCheckExistingScheduleConflicts,
  type ScheduleConflict as ScheduleCreationConflict,
} from "./schedule/conflict-awareness";
import { generateScheduleConflictSuggestions } from "./schedule/conflict-suggestions";
import type { ScheduleDraft } from "./schedule/draft";
import type { LocalBusyBlock } from "./schedule/free-slots";
import type { ScheduleSlots } from "./schedule/readiness";
import type { ScheduleModelInvocationOptions } from "./schedule/model-invocation";
import type { FrozenSchedulePlanProposal } from "./schedule/model-schemas";
import type { FrozenWeeklyReviewProposal } from "./review/model-schemas";
import {
  composeTimelineEventProposal,
  formatTimelineProposal,
} from "./workflows/timeline-composer";
import {
  modifyRecordDryRun,
  type ResolveModifyRecord,
} from "./tools/modify-record";
import {
  deleteRecordDryRun,
  type ResolveDeleteRecord,
} from "./tools/delete-record";
import { createChecklistFromIntent } from "./tools/checklist-create";
import { createScheduleItemsFromIntent } from "./tools/schedule-create-items";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;
type WritableAgentIntent = Extract<AgentIntent, { intent: AgentWriteIntentName }>;
type ClarifiableAgentIntentName = Exclude<AgentWriteIntentName, "compose_checklist" | "compose_timeline_event" | "query_schedule">;
type ToolRiskLevel = ProposedAgentAction["riskLevel"];

/** What this tool does — read, draft a proposal, generate a dry-run preview, write data, or roll back. */
export type AgentToolCapability = "read" | "draft" | "dry_run" | "write" | "rollback";

/** Descriptor for a tool's input schema so an LLM planner can understand expected args. */
export type AgentToolInputSchema =
  | { kind: "write-schema"; name: string }
  | { kind: "json-schema"; name: string; schema: unknown }
  | { kind: "manual"; name: string; description: string };

type ChecklistItem = {
  completedAt?: null | string;
  completionNote?: null | string;
  description?: null | string;
  id?: null | string;
  isCompleted?: boolean | null;
  title: string;
};
type ChecklistGroup = {
  id?: null | string;
  items?: ChecklistItem[] | null;
  title: string;
};
type ChecklistDocument = {
  groups?: ChecklistGroup[] | null;
  id: number;
  status?: string;
  title: string;
  visibility?: null | string;
};
type TimelineEventDocument = {
  id: number;
  visibility?: null | string;
};
type ScheduleConflictResolver = (args: {
  date: string;
  endTime?: null | string;
  excludeId?: number;
  startTime?: null | string;
}) => Promise<Array<{
  endTime?: null | string;
  id: number;
  startTime?: null | string;
  title: string;
}>>;
type PlanCandidate = {
  id?: null | number;
  priority?: null | string;
  state?: null | string;
  title: string;
};
type ResolveChecklistItem = (args: {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
}) => Promise<{
  question: null | string;
  resolved: null | {
    checklist: ChecklistDocument;
    group: ChecklistGroup;
    groupIndex: number;
    item: ChecklistItem;
    itemIndex: number;
  };
}>;
type ResolveChecklistGroupForAppend = (args: {
  checklistTitle: string;
  groupTitle?: null | string;
}) => Promise<{
  checklist?: ChecklistDocument;
  question: null | string;
  resolved: null | {
    checklist: ChecklistDocument;
    group: ChecklistGroup;
    groupIndex: number;
  };
}>;
type FindTimelineEvent = (args: {
  checklist: ChecklistDocument;
  item: ChecklistItem;
}) => Promise<null | TimelineEventDocument>;
export type ScheduleItemSnapshot = {
  date?: null | string;
  endTime?: null | string;
  id: number;
  isAllDay?: boolean | null;
  priority?: null | string;
  startTime?: null | string;
  status?: null | string;
  title?: null | string;
};
type ResolveScheduleItem = (itemId: number) => Promise<null | ScheduleItemSnapshot>;
type FindLocalBusyBlocks = (args: {
  endDate: string;
  startDate: string;
}) => Promise<LocalBusyBlock[]>;
type PrepareSchedulePlanProposal = (
  args: SchedulePlanArgs,
) => Promise<FrozenSchedulePlanProposal | null>;
type PrepareWeeklyReviewProposal = (
  args: WeeklyReviewArgs,
) => Promise<FrozenWeeklyReviewProposal | null>;
type ResolvedChecklistItem = NonNullable<Awaited<ReturnType<ResolveChecklistItem>>["resolved"]>;
type ResolvedChecklistGroup = NonNullable<Awaited<ReturnType<ResolveChecklistGroupForAppend>>["resolved"]>;

export type AgentToolDryRunContext = {
  createActionId?: () => string;
  detectScheduleConflicts?: ScheduleConflictResolver;
  findLocalBusyBlocks?: FindLocalBusyBlocks;
  findTimelineEvent?: FindTimelineEvent;
  now?: string;
  planCandidates?: PlanCandidate[];
  prepareSchedulePlanProposal?: PrepareSchedulePlanProposal;
  prepareWeeklyReviewProposal?: PrepareWeeklyReviewProposal;
  promptContext?: AgentPromptContext;
  resolveChecklistGroupForAppend?: ResolveChecklistGroupForAppend;
  resolveChecklistItem?: ResolveChecklistItem;
  resolveDeleteRecord?: ResolveDeleteRecord;
  resolveModifyRecord?: ResolveModifyRecord;
  resolveScheduleItem?: ResolveScheduleItem;
  scheduleModelInvocation?: ScheduleModelInvocationOptions;
  scheduleSlots?: ScheduleSlots | null;
};

export type AgentToolExecutionContext = {
  addCompletionNote?: (
    args: AddCompletionNoteArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  appendPlanItem?: (
    args: AppendPlanItemArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  completePlanItem?: (
    args: CompletePlanItemArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  composeTimelineEvent?: (
    args: ComposeTimelineEventArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  composeChecklist?: (
    args: ComposeChecklistArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  composePlan?: (
    args: ComposePlanArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  composeScheduleItem?: (
    args: ComposeScheduleItemArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  createScheduleItems?: (
    args: CreateScheduleItemsArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  cancelScheduleItem?: (
    args: CancelScheduleItemArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  createPlan?: (
    args: CreatePlanArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  deleteRecord?: (
    args: DeleteRecordArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  modifyRecord?: (
    args: ModifyRecordArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  now?: string;
  queryPlanProgress?: (
    args: QueryPlanProgressArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  querySchedule?: (
    args: QueryScheduleArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  rescheduleItem?: (
    args: RescheduleItemArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  saveMemory?: (
    args: SaveMemoryArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  schedulePlan?: (
    args: SchedulePlanArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  weeklyReview?: (
    args: WeeklyReviewArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
};

export type AgentToolDryRunResult = AgentDryRunClarifyResult | AgentDryRunProposedActionResult;

export type AgentToolDefinition<TName extends AgentWriteIntentName, TArgs> = {
  /** Human-readable description of what this tool does. */
  description: string;
  /** Generate a dry-run preview of the proposed action (no side effects). */
  dryRun: (args: TArgs, context: AgentToolDryRunContext) => Promise<AgentToolDryRunResult>;
  /** Execute the confirmed action (real side effects). */
  execute: (
    args: TArgs,
    context: AgentToolExecutionContext,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  /** The intent name this tool handles (must match a registered AgentWriteIntentName). */
  intent: TName;
  /** Unique name of the tool (must match intent). */
  name: TName;
  /** Whether the tool requires explicit user confirmation before execute. */
  requiresConfirmation: boolean;
  /** Risk level of the tool's operation. */
  riskLevel: ToolRiskLevel;
  /** Rollback strategy metadata (if the tool supports rollback). */
  rollback?: {
    description: string;
    status: "planned";
  };

  // ── LLM Planner metadata (Phase LLM-R2) ──

  /** Classification: read, draft, dry_run, write, or rollback. */
  capability: AgentToolCapability;
  /** Input schema descriptor for LLM Planner consumption. */
  inputSchema: AgentToolInputSchema;
  /** Optional output schema. */
  outputSchema?: unknown;
  /** Whether the tool can run without user confirmation (read/draft tools). */
  canRunWithoutConfirmation: boolean;
  /** Whether the tool supports dry-run preview generation. */
  supportsDryRun: boolean;
  /** Whether the tool supports real execution. */
  supportsExecute: boolean;
  /** Whether the tool supports rollback of executed actions. */
  supportsRollback: boolean;
};

type AgentToolRegistry = {
  add_completion_note: AgentToolDefinition<"add_completion_note", AddCompletionNoteArgs>;
  append_plan_item: AgentToolDefinition<"append_plan_item", AppendPlanItemArgs>;
  cancel_schedule_item: AgentToolDefinition<"cancel_schedule_item", CancelScheduleItemArgs>;
  complete_plan_item: AgentToolDefinition<"complete_plan_item", CompletePlanItemArgs>;
  compose_checklist: AgentToolDefinition<"compose_checklist", ComposeChecklistArgs>;
  compose_plan: AgentToolDefinition<"compose_plan", ComposePlanArgs>;
  compose_schedule_item: AgentToolDefinition<"compose_schedule_item", ComposeScheduleItemArgs>;
  compose_timeline_event: AgentToolDefinition<"compose_timeline_event", ComposeTimelineEventArgs>;
  create_checklist: AgentToolDefinition<"create_checklist", CreateChecklistArgs>;
  create_schedule_items: AgentToolDefinition<"create_schedule_items", CreateScheduleItemsArgs>;
  create_plan: AgentToolDefinition<"create_plan", CreatePlanArgs>;
  query_plan_progress: AgentToolDefinition<"query_plan_progress", QueryPlanProgressArgs>;
  query_schedule: AgentToolDefinition<"query_schedule", QueryScheduleArgs>;
  reschedule_item: AgentToolDefinition<"reschedule_item", RescheduleItemArgs>;
  save_memory: AgentToolDefinition<"save_memory", SaveMemoryArgs>;
  schedule_plan: AgentToolDefinition<"schedule_plan", SchedulePlanArgs>;
  delete_record: AgentToolDefinition<"delete_record", DeleteRecordArgs>;
  modify_record: AgentToolDefinition<"modify_record", ModifyRecordArgs>;
  weekly_review: AgentToolDefinition<"weekly_review", WeeklyReviewArgs>;
};

const visibilityOf = (doc: Pick<ChecklistDocument, "visibility">) =>
  doc.visibility === "public" || doc.visibility === "private" ? doc.visibility : "unknown";

const createProposedActionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `agent-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createClarifyResult = ({
  args,
  intent,
  missingFields,
  originalMessage,
  question,
}: {
  args: Partial<
    | AddCompletionNoteArgs
    | AppendPlanItemArgs
    | CancelScheduleItemArgs
    | CompletePlanItemArgs
    | ComposeChecklistArgs
    | ComposePlanArgs
    | ComposeScheduleItemArgs
    | CreateScheduleItemsArgs
    | CreatePlanArgs
    | DeleteRecordArgs
    | ModifyRecordArgs
    | QueryPlanProgressArgs
    | QueryScheduleArgs
    | RescheduleItemArgs
    | SaveMemoryArgs
    | SchedulePlanArgs
    | WeeklyReviewArgs
  >;
  intent: ClarifiableAgentIntentName;
  missingFields: string[];
  originalMessage?: string;
  question: string;
}): AgentDryRunClarifyResult => ({
  assistantMessage: question,
  pendingAction: {
    args,
    intent,
    missingFields,
    originalMessage,
    question,
    type: "await_clarification",
  },
  type: "clarify",
});

const checklistItemLabel = (checklistTitle: string, groupTitle: null | string | undefined, itemTitle: string) =>
  groupTitle ? `${checklistTitle} / ${groupTitle} / ${itemTitle}` : `${checklistTitle} / ${itemTitle}`;

const actionBase = ({
  args,
  context,
  intent,
  riskLevel,
  summary,
}: {
  args: unknown;
  context: AgentToolDryRunContext;
  intent: AgentWriteIntentName;
  riskLevel: ToolRiskLevel;
  summary: string;
}): Pick<
  ProposedAgentAction,
  "args" | "id" | "intent" | "requiresConfirmation" | "riskLevel" | "summary" | "toolName"
> => ({
  args,
  id: context.createActionId?.() ?? createProposedActionId(),
  intent,
  requiresConfirmation: riskLevel !== "low",
  riskLevel,
  summary,
  toolName: intent,
});

const createPlanDryRun = async (
  args: CreatePlanArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const nextPlan = {
    agentBrief: args.agentBrief ?? null,
    agentState: args.executionMode === "agent" ? "ready" : "idle",
    description: args.description ?? null,
    dueDate: args.dueDate ?? null,
    executionMode: args.executionMode ?? "manual",
    priority: args.priority ?? "medium",
    state: args.state ?? "backlog",
    status: "draft",
    title: args.title,
    visibility: "private",
  };

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "create_plan",
        riskLevel: "medium",
        summary: `创建计划「${args.title}」`,
      }),
      affectedDocuments: [
        {
          collection: "plans",
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: nextPlan,
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `私有草稿计划「${args.title}」，状态 ${nextPlan.state}，优先级 ${nextPlan.priority}。`,
          beforePreview: "当前不存在这条计划。",
          collection: "plans",
          operation: "create",
          preview: `创建私有草稿计划「${args.title}」，状态 ${nextPlan.state}，优先级 ${nextPlan.priority}，执行模式 ${nextPlan.executionMode}。`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        reason: "计划创建前没有 documentId；执行成功后可用 created document id 准备删除式回滚。",
        strategy: "delete_created_document",
        target: {
          collection: "plans",
          documentId: null,
        },
      },
    },
    type: "proposed_action",
  };
};

const countChecklistItems = (groups: CreateChecklistArgs["groups"]) =>
  groups.reduce((count, group) => count + group.items.length, 0);

const createChecklistDryRun = async (
  args: CreateChecklistArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const itemCount = countChecklistItems(args.groups);
  const groupCount = args.groups.length;
  const nextChecklist = {
    groups: args.groups.map((group) => ({
      items: group.items.map((item) => ({
        description: item.description ?? null,
        isCompleted: item.isCompleted ?? false,
        title: item.title,
      })),
      title: group.title,
    })),
    status: args.status ?? "draft",
    summary: args.summary ?? null,
    title: args.title,
    visibility: args.visibility ?? "private",
  };
  const groupPreview = args.groups
    .slice(0, 4)
    .map((group) => `${group.title}：${group.items.slice(0, 4).map((item) => item.title).join("；")}`)
    .join("\n");
  const sourcePlanId = typeof args.sourcePlanId === "number" ? args.sourcePlanId : null;

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "create_checklist",
        riskLevel: "medium",
        summary: `创建清单「${args.title}」（${groupCount} 个分组 / ${itemCount} 个条目）`,
      }),
      affectedDocuments: [
        {
          collection: "checklists",
          operation: "create",
          title: args.title,
          visibility: nextChecklist.visibility,
        },
        ...(sourcePlanId != null
          ? [
              {
                collection: "plans",
                documentId: sourcePlanId,
                operation: "update" as const,
                title: `计划 #${sourcePlanId}`,
                visibility: "unknown" as const,
              },
            ]
          : []),
      ],
      afterSnapshot: {
        ...nextChecklist,
        sourcePlanId,
      },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: [
            args.summary,
            groupPreview ? `分组预览：\n${groupPreview}` : null,
          ].filter(Boolean).join("\n\n"),
          beforePreview: "当前不存在这份清单。",
          collection: "checklists",
          operation: "create",
          preview: `创建${nextChecklist.visibility === "private" ? "私有" : "公开"}${nextChecklist.status === "draft" ? "草稿" : "发布"}清单「${args.title}」，包含 ${groupCount} 个分组 / ${itemCount} 个条目。`,
          timelineAffected: false,
          visibility: nextChecklist.visibility,
        },
        ...(sourcePlanId != null
          ? [
              {
                beforePreview: `计划 #${sourcePlanId} 当前 linkedContent。`,
                collection: "plans",
                documentId: sourcePlanId,
                operation: "update" as const,
                preview: `将新建清单关联到计划 #${sourcePlanId} 的 linkedContent。`,
                timelineAffected: false,
                visibility: "unknown" as const,
              },
            ]
          : []),
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        reason: "清单创建前没有 documentId；执行成功后可用 created document id 准备删除式回滚。",
        strategy: "delete_created_document",
        target: {
          collection: "checklists",
          documentId: null,
        },
      },
    },
    type: "proposed_action",
  };
};

const buildPlanClarifyQuestion = (missing: {
  hasTopic: boolean;
  hasDate: boolean;
  hasDuration: boolean;
}): string => {
  const missingParts: string[] = [];
  if (!missing.hasTopic) missingParts.push("主题/目标");
  if (!missing.hasDate) missingParts.push("开始日期");
  if (!missing.hasDuration) missingParts.push("周期/时长");

  if (missingParts.length === 0) {
    return "这条计划的目标还太松了。你希望它最终产出什么？";
  }

  if (!missing.hasTopic && missing.hasDate && missing.hasDuration) {
    return "这条计划具体围绕什么主题？比如学习某门课程、安排一次旅行、推进一个项目等。";
  }

  if (missing.hasTopic && !missing.hasDate && !missing.hasDuration) {
    return "这个计划什么时候开始、持续多久？比如「明天开始，2周内完成」。";
  }

  if (!missing.hasTopic && !missing.hasDate && !missing.hasDuration) {
    return "这条计划的目标还太松了。你希望它最终产出什么？大概需要多长时间？有没有一个开始日期？";
  }

  return `还需要补充：${missingParts.join("、")}。请简单说一下。`;
};

const composePlanDryRun = async (
  args: ComposePlanArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const normalized = normalizeComposePlanArgs(args);
  const parsed = parsePlanSeedFromText(normalized.sourceText || normalized.goal || "");
  const hasTopic = Boolean(parsed.topic);
  const hasDate = Boolean(parsed.startDate);
  const hasDuration = Boolean(parsed.durationDays);

  if (isPlanComposerInputAmbiguous(normalized)) {
    return createClarifyResult({
      args: normalized,
      intent: "compose_plan",
      missingFields: ["goal"],
      originalMessage: normalized.sourceText ?? undefined,
      question: buildPlanClarifyQuestion({ hasTopic, hasDate, hasDuration }),
    });
  }

  // Tool dry-runs are deterministic. Optional model decomposition is owned by
  // the chat pipeline and must arrive as a validated `decomposed` draft.
  const decomposed = normalized.decomposed ?? decomposePlanRuleBased(normalized);

  const domain = inferDomain(parsed.topic, normalized.sourceText ?? "");

  if (!decomposed) {
    const sourceLen = normalized.sourceText?.length ?? 0;

    if (sourceLen > 20) {
      const draftProposal = composePlanProposal({ ...normalized, domain });
      const draftDescription = formatPlanProposalDescription(draftProposal);
      const draftArgs: ComposePlanArgs = { ...normalized, domain, proposal: draftProposal };
      const draftPlan = {
        agentBrief: draftProposal.agentBrief,
        agentState: "ready",
        description: draftDescription,
        domain,
        dueDate: draftProposal.suggestedDueDate ?? null,
        executionMode: "hybrid",
        priority: draftProposal.suggestedPriority,
        state: "backlog",
        status: "draft",
        title: draftProposal.title,
        visibility: "private",
      };

      return {
        action: {
          ...actionBase({
            args: draftArgs,
            context,
            intent: "compose_plan",
            riskLevel: "medium",
            summary: `创建计划「${draftProposal.title}」（草稿）`,
          }),
          affectedDocuments: [
            { collection: "plans", operation: "create", visibility: "private" },
          ],
          afterSnapshot: { ...draftPlan, proposal: draftProposal },
          beforeSnapshot: null,
          changes: [
            {
              afterPreview: `目标：${draftProposal.goal}\n下一步：${draftProposal.nextActions.slice(0, 3).join("；")}`,
              beforePreview: "当前不存在这条计划。",
              collection: "plans",
              operation: "create",
              preview: `生成并创建草稿计划「${draftProposal.title}」，优先级 ${draftProposal.suggestedPriority}。我根据你提供的信息生成了一个初步计划，你可以确认后继续调整。`,
              timelineAffected: false,
              visibility: "private",
            },
          ],
          rollbackAvailable: true,
          rollbackPayload: {
            reason: "草稿计划 — 执行后可撤销删除。",
            strategy: "delete_created_document",
            target: { collection: "plans", documentId: null },
          },
        },
        type: "proposed_action",
      };
    }

    const decomposeMissing = [!hasTopic && "主题", !hasDate && "开始时间", !hasDuration && "总时长"].filter(Boolean).join("、");
    return createClarifyResult({
      args: normalized,
      intent: "compose_plan",
      missingFields: ["goal", "sourceText"],
      originalMessage: normalized.sourceText ?? undefined,
      question: decomposeMissing
        ? `我还无法拆解这个计划。请补充更具体的细节（如${decomposeMissing}）。`
        : "我还无法从你的描述里拆出具体阶段。请补充更多细节。",
    });
  }

  const proposal = composePlanProposalFromDecomposed(
    { ...normalized, decomposed, domain },
    decomposed,
  );
  const description = formatPlanProposalDescription(proposal);
  const nextArgs: ComposePlanArgs = {
    ...normalized,
    decomposed,
    domain,
    proposal,
  };
  const nextPlan = {
    agentBrief: proposal.agentBrief,
    agentState: "ready",
    description,
    domain,
    dueDate: proposal.suggestedDueDate ?? null,
    executionMode: "hybrid",
    priority: proposal.suggestedPriority,
    state: "backlog",
    status: "draft",
    title: proposal.title,
    visibility: "private",
  };

  return {
    action: {
      ...actionBase({
        args: nextArgs,
        context,
        intent: "compose_plan",
        riskLevel: "medium",
        summary: decomposed
          ? `创建完整计划「${proposal.title}」（${decomposed.phases.length} 个阶段）`
          : `创建完整计划「${proposal.title}」`,
      }),
      affectedDocuments: [
        {
          collection: "plans",
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        ...nextPlan,
        proposal,
      },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `目标：${proposal.goal}\n关键步骤：${proposal.keySteps.slice(0, 3).join("；")}\n验收：${proposal.successCriteria.slice(0, 2).join("；")}`,
          beforePreview: "当前不存在这条完整计划。",
          collection: "plans",
          operation: "create",
          preview: `生成并创建私有草稿计划「${proposal.title}」，优先级 ${proposal.suggestedPriority}${proposal.suggestedDueDate ? `，建议截止 ${proposal.suggestedDueDate}` : ""}。`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        strategy: "delete_created_document",
        target: {
          collection: "plans",
          documentId: null,
        },
      },
    },
    type: "proposed_action",
  };
};

const scheduleConflictLabel = (conflicts: ScheduleConflict[]) =>
  conflicts.length > 0
    ? `冲突：${conflicts.map((item) => item.title).join("；")}`
    : "没有检测到时间冲突。";

const parseTimeToMinutes = (value: null | string | undefined) => {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const formatMinutesAsTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const overlapsTimeRange = (start: number, end: number, conflict: ScheduleConflict) => {
  const conflictStart = parseTimeToMinutes(conflict.startTime);
  const conflictEnd = parseTimeToMinutes(conflict.endTime);

  if (conflictStart === null || conflictEnd === null) {
    return false;
  }

  return start < conflictEnd && conflictStart < end;
};

const buildScheduleConflictAdjustment = (
  proposal: import("./schemas").ScheduleProposal,
  conflicts: ScheduleConflict[],
) => {
  if (conflicts.length === 0 || proposal.isAllDay) {
    return null;
  }

  const originalStart = parseTimeToMinutes(proposal.startTime);
  const originalEnd = parseTimeToMinutes(proposal.endTime);

  if (originalStart === null || originalEnd === null || originalEnd <= originalStart) {
    return null;
  }

  let candidateStart = originalStart;
  let candidateEnd = originalEnd;
  const duration = originalEnd - originalStart;
  const sortedConflicts = [...conflicts].sort(
    (left, right) => (parseTimeToMinutes(left.startTime) ?? 0) - (parseTimeToMinutes(right.startTime) ?? 0),
  );

  for (let guard = 0; guard < sortedConflicts.length + 2; guard += 1) {
    const conflict = sortedConflicts.find((item) => overlapsTimeRange(candidateStart, candidateEnd, item));

    if (!conflict) {
      break;
    }

    const conflictEnd = parseTimeToMinutes(conflict.endTime);

    if (conflictEnd === null) {
      return null;
    }

    candidateStart = conflictEnd;
    candidateEnd = candidateStart + duration;

    if (candidateEnd > 23 * 60 + 59) {
      return null;
    }
  }

  if (candidateStart === originalStart) {
    return null;
  }

  const nextStartTime = formatMinutesAsTime(candidateStart);
  const nextEndTime = formatMinutesAsTime(candidateEnd);
  const conflictTitles = conflicts.map((item) => item.title).join("；");

  return {
    adjustedProposal: {
      ...proposal,
      conflicts: [],
      endTime: nextEndTime,
      reason: `${proposal.reason} 已自动避让冲突：${conflictTitles}。`,
      startTime: nextStartTime,
    },
    message: `自动避让冲突：${conflictTitles}；从 ${proposal.startTime}-${proposal.endTime} 调整为 ${nextStartTime}-${nextEndTime}。`,
    originalRange: `${proposal.startTime}-${proposal.endTime}`,
  };
};

/* ──── R6-C0-A: compose_checklist draft dryRun ──── */

const composeChecklistDryRun = async (
  args: ComposeChecklistArgs,
  _context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const title = args.title ?? args.goal ?? "清单草案";
  const itemsCount = args.items?.length ?? 0;
  const summary = itemsCount > 0
    ? `生成清单草案「${title}」，包含 ${itemsCount} 个待办条目`
    : `生成清单草案「${title}」，待拆解为具体条目`;

  return {
    action: {
      ...actionBase({
        args,
        context: _context,
        intent: "compose_checklist",
        riskLevel: "low",
        summary,
      }),
      affectedDocuments: [],
      afterSnapshot: null,
      beforeSnapshot: null,
      changes: [],
      requiresConfirmation: false,
      rollbackAvailable: false,
    },
    type: "proposed_action",
  };
};

const composeScheduleItemDryRun = async (
  args: ComposeScheduleItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const enrichedArgs = args;

  if (isScheduleComposerDateAmbiguous(enrichedArgs, context.now)) {
    return createClarifyResult({
      args,
      intent: "compose_schedule_item",
      missingFields: ["date"],
      question: "这条日程要安排到哪一天？你可以说“今天下午”“明天上午”或直接给一个日期。",
    });
  }

  const firstProposal = await composeScheduleProposalAsync(enrichedArgs, {
    modelInvocation: context.scheduleModelInvocation,
    now: context.now,
    planCandidates: context.planCandidates,
  });
  const conflictDocs = firstProposal.date && context.detectScheduleConflicts
    ? await context.detectScheduleConflicts({
        date: firstProposal.date,
        endTime: firstProposal.endTime,
        startTime: firstProposal.startTime,
      })
    : [];
  const conflicts = toScheduleConflicts(conflictDocs);
  const conflictAdjustment = buildScheduleConflictAdjustment(firstProposal, conflicts);
  const proposal = await composeScheduleProposalAsync(
    {
      ...enrichedArgs,
      proposal: {
        ...(conflictAdjustment?.adjustedProposal ?? firstProposal),
        conflicts: conflictAdjustment ? [] : conflicts,
      },
    },
    {
      conflicts: conflictAdjustment ? [] : conflicts,
      modelInvocation: context.scheduleModelInvocation,
      now: context.now,
      planCandidates: context.planCandidates,
    } satisfies ScheduleComposerContext,
  );
  const nextArgs: ComposeScheduleItemArgs = {
    ...args,
    proposal,
  };
  const timePreview = proposal.isAllDay
    ? "全天"
    : [proposal.startTime, proposal.endTime].filter(Boolean).join("-") || "未定时间";

  return {
    action: {
      ...actionBase({
        args: nextArgs,
        context,
        intent: "compose_schedule_item",
        riskLevel: proposal.conflicts.length > 0 ? "high" : "medium",
        summary: `创建日程「${proposal.title}」`,
      }),
      affectedDocuments: [
        {
          collection: "schedule-items",
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: proposal,
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `${proposal.date} ${timePreview}\n${proposal.reason}\n${scheduleConflictLabel(conflicts)}`,
          beforePreview: conflictAdjustment
            ? `原建议 ${proposal.date} ${conflictAdjustment.originalRange} 与 ${conflicts.map((item) => item.title).join("；")} 冲突。`
            : "当前不存在这条日程。",
          collection: "schedule-items",
          operation: "create",
          preview: conflictAdjustment
            ? `创建日程「${proposal.title}」：${proposal.date} ${timePreview}。${conflictAdjustment.message}`
            : `创建日程「${proposal.title}」：${proposal.date} ${timePreview}。${scheduleConflictLabel(conflicts)}`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        strategy: "delete_created_document",
        target: {
          collection: "schedule-items",
          documentId: null,
        },
      },
    },
    type: "proposed_action",
  };
};

const saveMemoryDryRun = async (
  args: SaveMemoryArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const memory = parseAgentMemoryInput({
    ...args,
    status: "active",
  });

  if (!memory) {
    return createClarifyResult({
      args,
      intent: "save_memory",
      missingFields: ["content"],
      question: "你想让我长期记住什么？请用一句话说明偏好、规则、写作风格或项目事实。",
    });
  }

  const typeLabelMap: Record<NonNullable<SaveMemoryArgs["type"]>, string> = {
    fact: "事实",
    preference: "偏好",
    project_context: "项目上下文",
    workflow_rule: "工作流规则",
    writing_style: "写作风格",
  };
  const typeLabel = typeLabelMap[memory.type];
  const leadingPreview =
    memory.type === "preference"
      ? `我可以把这个偏好记住：${memory.content}`
      : `我可以把这条${typeLabel}记住：${memory.content}`;

  return {
    action: {
      ...actionBase({
        args: {
          confidence: memory.confidence,
          content: memory.content,
          title: memory.title,
          type: memory.type,
        },
        context,
        intent: "save_memory",
        riskLevel: "medium",
        summary: `保存长期记忆「${memory.title}」`,
      }),
      affectedDocuments: [
        {
          collection: "agent-memories",
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: memory,
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `active/private memory，type=${memory.type}，confidence=${memory.confidence.toFixed(2)}。`,
          beforePreview: "当前还未保存这条长期记忆。",
          collection: "agent-memories",
          operation: "create",
          preview: leadingPreview,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        reason: "记忆 upsert 需要执行后确认最终 documentId；后续可通过 archive_created_memory 回滚。",
        strategy: "archive_created_memory",
        target: {
          collection: "agent-memories",
          documentId: null,
        },
      },
    },
    type: "proposed_action",
  };
};

const weeklyReviewDryRun = async (
  args: WeeklyReviewArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const persistReview = args.persistReview !== false;
  const riskLevel: ToolRiskLevel = persistReview ? "medium" : "low";

  if (!persistReview) {
    return {
      action: {
        ...actionBase({
          args: {
            createSuggestions: args.createSuggestions !== false,
            now: args.now ?? null,
            persistReview: false,
          },
          context,
          intent: "weekly_review",
          riskLevel,
          summary: "预览本周复盘，不保存内容",
        }),
        affectedDocuments: [],
        afterSnapshot: { scope: "weekly_review_preview" },
        beforeSnapshot: null,
        changes: [{
          afterPreview: "只生成本周回顾预览，不写入数据库。",
          beforePreview: "当前尚未生成这次周复盘。",
          collection: "plan-reviews",
          operation: "create",
          preview: "预览本周完成、风险、记录缺口和下周建议。",
          timelineAffected: false,
          visibility: "private",
        }],
        rollbackAvailable: false,
        rollbackPayload: null,
      },
      type: "proposed_action",
    };
  }

  const proposal = await context.prepareWeeklyReviewProposal?.(args) ?? null;

  if (!proposal) {
    return createClarifyResult({
      args: {
        createSuggestions: args.createSuggestions !== false,
        now: args.now ?? null,
        persistReview,
      },
      intent: "weekly_review",
      missingFields: ["weeklyReviewProposal"],
      question: "暂时无法生成可确认的本周回顾，请稍后重试。",
    });
  }

  return {
    action: {
      ...actionBase({
        args: {
          createSuggestions: proposal.createSuggestions,
          now: args.now ?? null,
          persistReview,
          proposal,
        },
        context,
        intent: "weekly_review",
        riskLevel,
        summary: persistReview ? "保存本周复盘" : "预览本周复盘，不保存内容",
      }),
      affectedDocuments: persistReview
        ? [
            {
              collection: "plan-reviews",
              operation: "create",
              visibility: "private",
            },
            {
              collection: "agent-runs",
              operation: "create",
              visibility: "private",
            },
            ...(args.createSuggestions === false
              ? []
              : [
                  {
                    collection: "agent-suggestions",
                    operation: "create" as const,
                    visibility: "private" as const,
                  },
                ]),
          ]
        : [],
      afterSnapshot: persistReview
        ? {
            createSuggestions: proposal.createSuggestions,
            proposal,
            scope: "weekly_review",
            snapshotFingerprint: proposal.snapshotFingerprint,
          }
        : {
            proposal,
            scope: "weekly_review_preview",
            snapshotFingerprint: proposal.snapshotFingerprint,
          },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: persistReview
            ? `将按确认内容保存本周复盘，并记录 ${proposal.recommendations.length} 项下周建议。`
            : "只展示已生成的本周回顾，不写入数据库。",
          beforePreview: "当前尚未保存这次周复盘。",
          collection: "plan-reviews",
          operation: "create",
          preview: persistReview
            ? `保存已确认的本周复盘：${proposal.risks.length} 项风险、${proposal.recommendations.length} 项建议。`
            : proposal.assistantMessage,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: persistReview,
      rollbackPayload: persistReview
        ? {
            reason: "复盘和行动建议需要保存后才能取得记录编号；运行记录将保留为所有权绑定的回滚审计。",
            strategy: "delete_created_weekly_review_artifacts",
            target: {
              agentRunId: null,
              planReviewId: null,
              suggestionIds: [],
            },
          }
        : null,
    },
    type: "proposed_action",
  };
};

const scheduleItemsDateRange = (items: CreateScheduleItemsArgs["items"]): string => {
  const dates = Array.from(new Set(items.map((item) => item.date).filter(Boolean))).sort();

  if (dates.length === 0) {
    return "未确定日期";
  }

  return dates.length === 1 ? dates[0]! : `${dates[0]} → ${dates[dates.length - 1]}`;
};

const normalizeDateKeyForScheduleSuggestions = (value: null | string | undefined): string => {
  const normalized = value?.trim() ?? "";
  const isoDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (isoDate?.[1]) return isoDate[1];

  return normalized.slice(0, 10);
};

const scheduleSuggestionDateBounds = (
  args: CreateScheduleItemsArgs,
  slots?: null | ScheduleSlots,
): null | { endDate: string; startDate: string } => {
  const dates = new Set<string>();

  for (const item of args.items) {
    const date = normalizeDateKeyForScheduleSuggestions(item.date);
    if (date) dates.add(date);
  }

  for (const window of slots?.availableTimeWindows ?? []) {
    const date = normalizeDateKeyForScheduleSuggestions(window.day);
    if (date) dates.add(date);
  }

  const sortedDates = Array.from(dates).sort();
  if (sortedDates.length === 0) return null;

  return {
    endDate: sortedDates[sortedDates.length - 1]!,
    startDate: sortedDates[0]!,
  };
};

const findLocalBusyBlocksForScheduleSuggestions = async (
  args: CreateScheduleItemsArgs,
  context: AgentToolDryRunContext,
): Promise<LocalBusyBlock[] | undefined> => {
  if (!context.findLocalBusyBlocks) return undefined;
  const bounds = scheduleSuggestionDateBounds(args, context.scheduleSlots);
  if (!bounds) return undefined;

  try {
    return await context.findLocalBusyBlocks(bounds);
  } catch {
    return undefined;
  }
};

const scheduleItemTimePreview = (item: CreateScheduleItemsArgs["items"][number]): string =>
  item.isAllDay
    ? "全天"
    : [item.startTime, item.endTime].filter(Boolean).join("-") || "未定时间";

const detectCreateScheduleItemConflictsForDryRun = async (
  args: CreateScheduleItemsArgs,
  context: AgentToolDryRunContext,
): Promise<{
  conflicts: ScheduleCreationConflict[];
  existingScheduleChecked: boolean;
}> => {
  const internalConflicts = detectScheduleConflictsForItems({
    proposedItems: args.items,
  });
  const existingConflicts: ScheduleCreationConflict[] = [];

  if (!context.detectScheduleConflicts) {
    return {
      conflicts: internalConflicts,
      existingScheduleChecked: false,
    };
  }

  for (const item of args.items) {
    if (!shouldCheckExistingScheduleConflicts(item)) {
      continue;
    }

    try {
      const conflicts = await context.detectScheduleConflicts({
        date: item.date,
        endTime: item.isAllDay ? null : item.endTime,
        startTime: item.isAllDay ? null : item.startTime,
      });

      existingConflicts.push(...conflicts.map((conflict) => scheduleConflictFromExistingMatch(item, {
        endTime: conflict.endTime ?? null,
        id: conflict.id,
        startTime: conflict.startTime ?? null,
        title: conflict.title,
      })));
    } catch {
      return {
        conflicts: internalConflicts,
        existingScheduleChecked: false,
      };
    }
  }

  return {
    conflicts: [...internalConflicts, ...existingConflicts],
    existingScheduleChecked: true,
  };
};

const formatScheduleConflictPreview = (
  conflicts: ScheduleCreationConflict[],
  summaryMessage: string,
): string => {
  const lines = formatScheduleConflictLines(conflicts, 5);
  const more = conflicts.length > lines.length ? `另有 ${conflicts.length - lines.length} 条冲突或提醒未展开。` : null;

  return [summaryMessage, lines.length ? `冲突详情：\n${lines.join("\n")}` : null, more].filter(Boolean).join("\n");
};

const scheduleDraftFromCreateItemsArgs = (args: CreateScheduleItemsArgs): ScheduleDraft => ({
  assumptions: ["这是准备创建前的日程草案快照，尚未写入日程。"],
  conflicts: ["准备创建时会再次检查真实冲突。"],
  items: args.items.map((item) => ({
    date: item.date,
    endTime: item.endTime ?? null,
    sourceChecklistId: item.relatedChecklistId ?? args.sourceChecklistId ?? null,
    sourceChecklistItemKey: item.relatedChecklistItemKey ?? null,
    sourcePlanId: item.relatedPlanId ?? args.sourcePlanId ?? null,
    sourceTaskTitle: item.sourceTaskTitle ?? item.description ?? null,
    startTime: item.startTime ?? null,
    title: item.title,
  })),
  nextActions: ["调整时间", "允许重叠", "暂不安排冲突项"],
  sourceChecklistId: args.sourceChecklistId ?? null,
  sourcePlanId: args.sourcePlanId ?? null,
  sourceType: args.sourceType ?? "manual",
  title: args.title ?? "日程草案",
});

const createScheduleItemsDryRun = async (
  args: CreateScheduleItemsArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  if (!Array.isArray(args.items) || args.items.length === 0) {
    return createClarifyResult({
      args,
      intent: "create_schedule_items",
      missingFields: ["items"],
      question: "当前没有可创建的日程项，请先生成日程草案。",
    });
  }

  const invalidDateIndex = args.items.findIndex((item) => !item.date?.trim());
  if (invalidDateIndex >= 0) {
    return createClarifyResult({
      args,
      intent: "create_schedule_items",
      missingFields: [`items[${invalidDateIndex}].date`],
      question: "当前日程草案仍有未确定日期的项目，请先补充具体日期或让我重新调整草案。",
    });
  }

  const itemCount = args.items.length;
  const dateRange = scheduleItemsDateRange(args.items);
  const sourceLabel =
    args.sourceType === "plan"
      ? "计划"
      : args.sourceType === "checklist"
        ? "清单"
        : "手动";
  const hasConflictNote = args.items.some((item) => Boolean(item.conflictNote?.trim()));
  const itemPreview = args.items
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.date} ${scheduleItemTimePreview(item)} ${item.title}`)
    .join("\n");
  const conflictPolicy = getCreateScheduleItemsConflictPolicy(args);
  const conflictDetection = await detectCreateScheduleItemConflictsForDryRun(args, context);
  const conflictSummary = buildScheduleConflictSummary({
    conflictPolicy,
    conflicts: conflictDetection.conflicts,
    existingScheduleChecked: conflictDetection.existingScheduleChecked,
  });
  const conflictPreview = formatScheduleConflictPreview(conflictDetection.conflicts, conflictSummary.message);
  const localBusyBlocks = await findLocalBusyBlocksForScheduleSuggestions(args, context);
  const conflictSuggestions = generateScheduleConflictSuggestions({
    ...(localBusyBlocks ? { busyBlocks: localBusyBlocks } : {}),
    conflicts: conflictDetection.conflicts,
    draft: scheduleDraftFromCreateItemsArgs(args),
    ...(context.scheduleSlots ? { slots: context.scheduleSlots } : {}),
  });
  const suggestionPreview = conflictSuggestions.length > 0
    ? `可选调整建议：\n${conflictSuggestions.map((suggestion) => `- ${suggestion.label}`).join("\n")}\n选择后我会先更新草案；准备创建时会再次检查真实冲突。`
    : null;

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "create_schedule_items",
        riskLevel: "medium",
        summary: `创建 ${itemCount} 个日程项${args.title ? `「${args.title}」` : ""}`,
      }),
      affectedDocuments: [
        {
          collection: "schedule-items",
          operation: "create",
          title: args.title ?? `批量日程项（${itemCount} 个）`,
          visibility: "private",
        },
      ],
      afterSnapshot: {
        conflictSummary,
        dateRange,
        hasConflictNote,
        conflictSuggestions,
        items: args.items,
        scheduleConflicts: conflictDetection.conflicts,
        sourceChecklistId: args.sourceChecklistId ?? null,
        sourcePlanId: args.sourcePlanId ?? null,
        sourceType: args.sourceType ?? "manual",
        title: args.title ?? null,
      },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: [
            `时间范围：${dateRange}`,
            `来源：${sourceLabel}`,
            args.sourcePlanId ? `来源计划：${args.sourcePlanId}` : null,
            args.sourceChecklistId ? `来源清单：${args.sourceChecklistId}` : null,
            `冲突提示：${conflictSummary.conflictCount > 0 ? `发现 ${conflictSummary.conflictCount} 个时间冲突` : hasConflictNote ? "存在，需要确认" : "暂无"}`,
            conflictPreview,
            suggestionPreview,
            itemPreview ? `日程项预览：\n${itemPreview}` : null,
          ].filter(Boolean).join("\n"),
          beforePreview: "当前尚未创建这些日程项。",
          collection: "schedule-items",
          operation: "create",
          preview: `创建 ${itemCount} 个日程项；时间范围：${dateRange}；确认后才会写入日程。`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        reason: "K5 仅生成批量日程创建确认；K6 执行成功后会用创建出的日程项 ID 完整化 rollback。",
        strategy: "delete_created_documents",
        target: {
          collection: "schedule-items",
          documentIds: [],
        },
      },
    },
    type: "proposed_action",
  };
};

const queryPlanProgressDryRun = async (
  args: QueryPlanProgressArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const targetPlan = args.planId
    ? context.planCandidates?.find((p) => p.id === args.planId)
    : args.planTitle
      ? context.planCandidates?.find((p) =>
          p.title.toLowerCase().includes(args.planTitle?.toLowerCase() ?? ""),
        )
      : null;

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "query_plan_progress",
        riskLevel: "low",
        summary: targetPlan
          ? `查询计划「${targetPlan.title}」的进度和阶段完成情况`
          : "查询计划的进度和阶段完成情况",
      }),
      affectedDocuments: [],
      afterSnapshot: null,
      beforeSnapshot: null,
      // 只读查询不产生任何写入变更；保持 changes 为空以避免误报为 create 操作。
      changes: [],
      requiresConfirmation: false,
      rollbackAvailable: false,
    },
    type: "proposed_action",
  };
};

/* ──── R5-C: query_schedule read-only dryRun ──── */

const RANGE_LABELS: Record<string, string> = {
  next_week: "下周",
  this_week: "本周",
  today: "今天",
  tomorrow: "明天",
  upcoming: "最近 / 未来 7 天",
};

const queryScheduleDryRun = async (
  args: QueryScheduleArgs,
  _context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const rangeLabel = args.range ? RANGE_LABELS[args.range] ?? "最近 / 未来 7 天" : "最近 / 未来 7 天";

  return {
    assistantMessage: `正在查询${rangeLabel}的日程安排。这是只读查询，不会创建或修改任何日程项。`,
    pendingAction: null,
    type: "clarify",
  };
};

const schedulePlanDryRun = async (
  args: SchedulePlanArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const targetPlan = context.planCandidates?.find((p) => p.id === args.planId);
  if (!targetPlan) {
    return createClarifyResult({
      args,
      intent: "schedule_plan" as ClarifiableAgentIntentName,
      missingFields: ["planId"],
      question: `我找不到 ID 为 ${args.planId} 的计划。请确认计划 ID 是否正确。`,
    });
  }

  const proposal = await context.prepareSchedulePlanProposal?.(args) ?? null;

  if (!proposal) {
    return createClarifyResult({
      args: {
        defaultDurationMinutes: args.defaultDurationMinutes,
        defaultStartTime: args.defaultStartTime,
        planId: args.planId,
        startDate: args.startDate,
      },
      intent: "schedule_plan",
      missingFields: ["scheduleProposal"],
      question: `暂时无法为计划「${targetPlan.title}」生成可确认的排期草案，请稍后重试。`,
    });
  }

  const firstDate = proposal.items[0]?.date ?? proposal.startDate;
  const lastDate = proposal.items[proposal.items.length - 1]?.date ?? firstDate;

  return {
    action: {
      ...actionBase({
        args: { ...args, proposal },
        context,
        intent: "schedule_plan",
        riskLevel: "medium",
        summary: `将计划「${targetPlan.title}」的阶段任务排入日程`,
      }),
      affectedDocuments: [
        {
          collection: "schedule-items",
          operation: "create",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        planId: targetPlan.id,
        planTitle: targetPlan.title,
        proposal,
        scheduleCount: proposal.items.length,
        startDate: proposal.startDate,
      },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `将创建 ${proposal.items.length} 条日程，日期范围 ${firstDate} 至 ${lastDate}。`,
          beforePreview: "当前计划尚未排入日程。",
          collection: "schedule-items",
          operation: "create",
          preview: `按已冻结草案将计划「${targetPlan.title}」的任务排入日程`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        reason: "执行成功后会用本次创建的全部日程项 ID 完整化 rollback。",
        strategy: "delete_created_documents",
        target: {
          collection: "schedule-items",
          documentIds: [],
        },
      },
    },
    type: "proposed_action",
  };
};

const rescheduleItemDryRun = async (
  args: RescheduleItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  if (!args.newDate && !args.newStartTime && !args.newEndTime && !args.newTitle) {
    return createClarifyResult({
      args,
      intent: "reschedule_item",
      missingFields: ["newDate"],
      question: "你想把这个日程改到哪一天？或者要改什么时间/标题？",
    });
  }

  const hasDateChange = Boolean(args.newDate);
  const riskLevel: ToolRiskLevel = hasDateChange ? "medium" : "low";
  const current = context.resolveScheduleItem ? await context.resolveScheduleItem(args.itemId) : null;
  const beforeText = current
    ? `原：${current.date ?? "?"} ${current.startTime ?? "?"}${current.endTime ? `-${current.endTime}` : ""} ${current.title ?? ""}`.trim()
    : `日程 #${args.itemId}`;

  const changes: ProposedAgentAction["changes"] = [
    {
      beforePreview: beforeText,
      collection: "schedule-items",
      documentId: args.itemId,
      operation: "update",
      preview: [
        args.newDate ? `改期至 ${args.newDate}` : null,
        args.newStartTime ? `新开始时间 ${args.newStartTime}` : null,
        args.newEndTime ? `新结束时间 ${args.newEndTime}` : null,
        args.newTitle ? `新标题「${args.newTitle}」` : null,
      ]
        .filter(Boolean)
        .join("，"),
      timelineAffected: false,
      visibility: "private",
    },
  ];

  const beforeSnapshot = current
    ? {
        date: current.date ?? null,
        endTime: current.endTime ?? null,
        isAllDay: current.isAllDay ?? false,
        itemId: args.itemId,
        priority: current.priority ?? null,
        startTime: current.startTime ?? null,
        status: current.status ?? null,
        title: current.title ?? null,
      }
    : {
        itemId: args.itemId,
      };

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "reschedule_item",
        riskLevel,
        summary: args.newTitle ? `改期「${args.newTitle}」` : `调整日程 #${args.itemId}`,
      }),
      affectedDocuments: [
        {
          collection: "schedule-items",
          documentId: args.itemId,
          operation: "update",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        itemId: args.itemId,
        newDate: args.newDate ?? null,
        newEndTime: args.newEndTime ?? null,
        newStartTime: args.newStartTime ?? null,
        newTitle: args.newTitle ?? null,
      },
      beforeSnapshot,
      changes,
      rollbackAvailable: true,
      rollbackPayload: {
        // 携带真实快照，使预览阶段的回滚描述即可执行（execute 仍会以写入前的实时数据重建）。
        ...(current
          ? {
              beforeSnapshot: {
                date: current.date ?? null,
                endTime: current.endTime ?? null,
                isAllDay: current.isAllDay ?? false,
                priority: current.priority ?? null,
                startTime: current.startTime ?? null,
                status: current.status ?? null,
                title: current.title ?? null,
              },
            }
          : {}),
        strategy: "restore_schedule_item_snapshot",
        target: {
          collection: "schedule-items",
          documentId: args.itemId,
        },
      },
    },
    type: "proposed_action",
  };
};

const cancelScheduleItemDryRun = async (
  args: CancelScheduleItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const current = context.resolveScheduleItem ? await context.resolveScheduleItem(args.itemId) : null;
  const currentStatus = current?.status ?? "planned";

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "cancel_schedule_item",
        riskLevel: "low",
        summary: current?.title ? `取消日程「${current.title}」` : `取消日程 #${args.itemId}`,
      }),
      affectedDocuments: [
        {
          collection: "schedule-items",
          documentId: args.itemId,
          operation: "update",
          visibility: "private",
        },
      ],
      afterSnapshot: {
        itemId: args.itemId,
        status: "canceled",
      },
      beforeSnapshot: {
        itemId: args.itemId,
        status: currentStatus,
      },
      changes: [
        {
          afterPreview: "日程状态将变为「已取消」。",
          beforePreview: `当前状态：${currentStatus}`,
          collection: "schedule-items",
          documentId: args.itemId,
          operation: "update",
          preview: args.reason
            ? `取消日程 #${args.itemId}，原因：${args.reason}`
            : `取消日程 #${args.itemId}`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        beforeSnapshot: {
          status: currentStatus,
        },
        strategy: "restore_schedule_item_status",
        target: {
          collection: "schedule-items",
          documentId: args.itemId,
        },
      },
    },
    type: "proposed_action",
  };
};

const composeTimelineEventDryRun = async (
  args: ComposeTimelineEventArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const proposal = composeTimelineEventProposal(args, context.now ?? new Date());

  if (!proposal) {
    return {
      assistantMessage: "我还没定位到要写入 Timeline 的来源。请告诉我来源类型和标题，或直接给一段要整理成时间线节点的文字。",
      pendingAction: null,
      type: "clarify",
    };
  }

  const createEvent = args.createEvent !== false;
  const riskLevel: ToolRiskLevel = !createEvent ? "low" : proposal.visibility === "public" ? "high" : "medium";
  const preview = formatTimelineProposal(proposal);

  return {
    action: {
      ...actionBase({
        args: {
          ...args,
          createEvent,
          eventDate: proposal.eventDate,
          isFeatured: proposal.isFeatured,
          sourceType: proposal.sourceType,
          type: proposal.type,
          visibility: proposal.visibility,
        },
        context,
        intent: "compose_timeline_event",
        riskLevel,
        summary: createEvent ? `创建 Timeline 节点「${proposal.title}」` : `生成 Timeline 节点提案「${proposal.title}」`,
      }),
      affectedDocuments: createEvent
        ? [
            {
              collection: "timeline-events",
              operation: "create",
              visibility: proposal.visibility,
            },
          ]
        : [],
      afterSnapshot: proposal,
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: preview,
          beforePreview: "当前还没有这条 Composer 提案对应的 TimelineEvent。",
          collection: "timeline-events",
          operation: "create",
          preview,
          timelineAffected: true,
          visibility: proposal.visibility,
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: createEvent
        ? {
            reason: "TimelineEvent 创建前还没有 documentId；执行成功后可通过删除新建节点回滚。",
            strategy: "delete_created_timeline_event",
            target: {
              collection: "timeline-events",
              documentId: null,
            },
          }
        : null,
    },
    type: "proposed_action",
  };
};

const appendPlanItemDryRun = async (
  args: AppendPlanItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const resolver = context.resolveChecklistGroupForAppend;

  if (!resolver) {
    return createClarifyResult({
      args,
      intent: "append_plan_item",
      missingFields: ["checklistTitle"],
      question: "我还不能在当前上下文里定位真实清单。请稍后重试，或告诉我更明确的清单和分组。",
    });
  }

  const target = await resolver(args);

  if (!target.resolved) {
    if (args.createGroupIfMissing && args.groupTitle && target.checklist) {
      const checklist = target.checklist;
      const nextItem = {
        description: args.description ?? null,
        isCompleted: false,
        title: args.itemTitle,
      };
      const visibility = visibilityOf(checklist);

      return {
        action: {
          ...actionBase({
            args,
            context,
            intent: "append_plan_item",
            riskLevel: "medium",
            summary: `向清单新建分组「${args.groupTitle}」并追加计划项「${args.itemTitle}」`,
          }),
          affectedDocuments: [
            {
              collection: "checklists",
              documentId: checklist.id,
              operation: "update",
              visibility,
            },
          ],
          afterSnapshot: {
            appendedItem: nextItem,
            checklistId: checklist.id,
            checklistTitle: checklist.title,
            createdGroup: true,
            groupTitle: args.groupTitle,
          },
          beforeSnapshot: {
            checklistId: checklist.id,
            checklistTitle: checklist.title,
            groupCount: checklist.groups?.length ?? 0,
            missingGroupTitle: args.groupTitle,
          },
          changes: [
            {
              afterPreview: `新建分组「${args.groupTitle}」，并新增未完成条目「${args.itemTitle}」${args.description ? `，说明：${args.description}` : ""}。`,
              beforePreview: `「${checklist.title}」当前没有分组「${args.groupTitle}」。`,
              collection: "checklists",
              documentId: checklist.id,
              operation: "update",
              preview: `向「${checklist.title}」新建分组「${args.groupTitle}」并追加未完成条目「${args.itemTitle}」。`,
              timelineAffected: false,
              visibility,
            },
          ],
          rollbackAvailable: true,
          rollbackPayload: {
            strategy: "restore_checklist_groups",
            target: {
              collection: "checklists",
              documentId: checklist.id,
            },
          },
        },
        type: "proposed_action",
      };
    }

    return createClarifyResult({
      args,
      intent: "append_plan_item",
      missingFields: args.groupTitle ? ["checklistTitle"] : ["groupTitle"],
      question: target.question ?? "我还没定位到要追加计划项的清单分组。",
    });
  }

  const { checklist, group } = target.resolved as ResolvedChecklistGroup;
  const existingItem = (group.items ?? []).find((item) => item.title === args.itemTitle);

  if (existingItem) {
    return createClarifyResult({
      args,
      intent: "append_plan_item",
      missingFields: ["itemTitle"],
      question: `「${checklist.title} / ${group.title} / ${existingItem.title}」已经存在。你要补的是另一条更具体的计划项吗？`,
    });
  }

  const nextItem = {
    description: args.description ?? null,
    isCompleted: false,
    title: args.itemTitle,
  };
  const visibility = visibilityOf(checklist);

  return {
    action: {
      ...actionBase({
        args,
        context,
        intent: "append_plan_item",
        riskLevel: "medium",
        summary: `向清单追加计划项「${args.itemTitle}」`,
      }),
      affectedDocuments: [
        {
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          visibility,
        },
      ],
      afterSnapshot: {
        appendedItem: nextItem,
        checklistId: checklist.id,
        checklistTitle: checklist.title,
        groupTitle: group.title,
      },
      beforeSnapshot: {
        checklistId: checklist.id,
        checklistTitle: checklist.title,
        groupItemCount: group.items?.length ?? 0,
        groupTitle: group.title,
      },
      changes: [
        {
          afterPreview: `新增未完成条目「${args.itemTitle}」${args.description ? `，说明：${args.description}` : ""}。`,
          beforePreview: `「${checklist.title} / ${group.title}」当前有 ${group.items?.length ?? 0} 个条目。`,
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          preview: `向「${checklist.title} / ${group.title}」追加未完成条目「${args.itemTitle}」。`,
          timelineAffected: false,
          visibility,
        },
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        strategy: "restore_checklist_groups",
        target: {
          collection: "checklists",
          documentId: checklist.id,
        },
      },
    },
    type: "proposed_action",
  };
};

const buildTimelineChange = async ({
  checklist,
  context,
  item,
  operationHint,
}: {
  checklist: ResolvedChecklistItem["checklist"];
  context: AgentToolDryRunContext;
  item: ResolvedChecklistItem["item"];
  operationHint: "complete" | "note";
}) => {
  const timelineEvent = context.findTimelineEvent
    ? await context.findTimelineEvent({
        checklist,
        item,
      })
    : null;
  const operation = timelineEvent ? "update" : "create";
  const verb = operationHint === "complete" ? "同步完成节点" : "同步完成备注";

  return {
    change: {
      afterPreview: timelineEvent ? `更新 TimelineEvent #${timelineEvent.id} 的说明或日期。` : "创建一个新的 Timeline 完成节点。",
      beforePreview: timelineEvent ? `已有 TimelineEvent #${timelineEvent.id}。` : "当前还没有对应 Timeline 节点。",
      collection: "timeline-events",
      ...(timelineEvent ? { documentId: timelineEvent.id } : {}),
      operation,
      preview: `${verb}，会影响 ${visibilityOf(checklist)} Timeline 叙事。`,
      timelineAffected: true,
      visibility: visibilityOf(checklist),
    } satisfies ProposedAgentAction["changes"][number],
    timelineEvent: timelineEvent as null | TimelineEventDocument,
  };
};

const completePlanItemDryRun = async (
  args: CompletePlanItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const resolver = context.resolveChecklistItem;

  if (!resolver) {
    return createClarifyResult({
      args,
      intent: "complete_plan_item",
      missingFields: ["checklistTitle", "itemTitle"],
      question: "我还不能在当前上下文里定位真实清单条目。请稍后重试，或告诉我更明确的清单、分组和条目。",
    });
  }

  const target = await resolver(args);

  if (!target.resolved) {
    return createClarifyResult({
      args,
      intent: "complete_plan_item",
      missingFields: args.groupTitle ? ["itemTitle"] : ["groupTitle"],
      question: target.question ?? "我还没定位到要完成的清单条目。",
    });
  }

  const { checklist, group, item } = target.resolved as ResolvedChecklistItem;

  if (item.isCompleted && !args.completionNote) {
    return {
      assistantMessage: `「${checklistItemLabel(checklist.title, group.title, item.title)}」已经是完成状态了。要不要我顺手补一句完成备注？`,
      pendingAction: {
        checklistTitle: checklist.title,
        groupTitle: group.title,
        itemTitle: item.title,
        type: "await_completion_note",
      },
      type: "clarify",
    };
  }

  const completedAt = args.completedAt ?? item.completedAt ?? context.now ?? new Date().toISOString();
  const nextCompletionNote = args.completionNote ?? item.completionNote ?? null;
  const visibility = visibilityOf(checklist);
  const timeline = await buildTimelineChange({
    checklist,
    context,
    item,
    operationHint: "complete",
  });

  return {
    action: {
      ...actionBase({
        args: {
          ...args,
          checklistTitle: checklist.title,
          groupTitle: group.title,
          itemTitle: item.title,
        },
        context,
        intent: "complete_plan_item",
        riskLevel: "high",
        summary: `标记清单条目完成「${checklistItemLabel(checklist.title, group.title, item.title)}」`,
      }),
      affectedDocuments: [
        {
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          visibility,
        },
        {
          collection: "timeline-events",
          ...(timeline.timelineEvent ? { documentId: timeline.timelineEvent.id } : {}),
          operation: timeline.change.operation,
          visibility,
        },
      ],
      afterSnapshot: {
        completedAt,
        completionNote: nextCompletionNote,
        isCompleted: true,
      },
      beforeSnapshot: {
        completedAt: item.completedAt ?? null,
        completionNote: item.completionNote ?? null,
        isCompleted: Boolean(item.isCompleted),
      },
      changes: [
        {
          afterPreview: `标记为完成，完成时间 ${completedAt}${nextCompletionNote ? `，备注：${nextCompletionNote}` : ""}。`,
          beforePreview: `当前状态：${item.isCompleted ? "已完成" : "未完成"}。`,
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          preview: `将「${checklistItemLabel(checklist.title, group.title, item.title)}」标记为完成。`,
          timelineAffected: true,
          visibility,
        },
        timeline.change,
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        // 占位预览：execute 会以写入前的真实清单快照重建该 payload。
        // 此处对齐 rollback.ts 实际支持的策略名，避免预览展示无法执行的策略。
        reason: "完成动作执行后才能拿到清单分组快照与 Timeline 节点 ID，届时会补齐 beforeSnapshot。",
        strategy: "restore_checklist_groups_and_timeline",
        target: {
          collection: "checklists",
          documentId: checklist.id,
          ...(timeline.timelineEvent?.id ? { timelineEventId: timeline.timelineEvent.id } : {}),
        },
      },
    },
    type: "proposed_action",
  };
};

const addCompletionNoteDryRun = async (
  args: AddCompletionNoteArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  const resolver = context.resolveChecklistItem;

  if (!resolver) {
    return createClarifyResult({
      args,
      intent: "add_completion_note",
      missingFields: ["checklistTitle", "itemTitle"],
      question: "我还不能在当前上下文里定位真实完成条目。请稍后重试，或告诉我更明确的清单、分组和条目。",
    });
  }

  const target = await resolver(args);

  if (!target.resolved) {
    return createClarifyResult({
      args,
      intent: "add_completion_note",
      missingFields: args.groupTitle ? ["itemTitle"] : ["groupTitle"],
      question: target.question ?? "我还没定位到要补备注的条目。",
    });
  }

  const { checklist, group, item } = target.resolved as ResolvedChecklistItem;

  if (!item.isCompleted) {
    return createClarifyResult({
      args,
      intent: "complete_plan_item",
      missingFields: ["completionNote"],
      question: `「${checklistItemLabel(checklist.title, group.title, item.title)}」还没被标记完成。你要不要先让我帮你把它标记完成？`,
    });
  }

  const visibility = visibilityOf(checklist);
  const timeline = await buildTimelineChange({
    checklist,
    context,
    item,
    operationHint: "note",
  });

  return {
    action: {
      ...actionBase({
        args: {
          ...args,
          checklistTitle: checklist.title,
          groupTitle: group.title,
          itemTitle: item.title,
        },
        context,
        intent: "add_completion_note",
        riskLevel: "high",
        summary: `补充完成备注「${checklistItemLabel(checklist.title, group.title, item.title)}」`,
      }),
      affectedDocuments: [
        {
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          visibility,
        },
        {
          collection: "timeline-events",
          ...(timeline.timelineEvent ? { documentId: timeline.timelineEvent.id } : {}),
          operation: timeline.change.operation,
          visibility,
        },
      ],
      afterSnapshot: {
        completionNote: args.completionNote,
      },
      beforeSnapshot: {
        completionNote: item.completionNote ?? null,
      },
      changes: [
        {
          afterPreview: `完成备注将更新为：${args.completionNote}`,
          beforePreview: item.completionNote ? `当前备注：${item.completionNote}` : "当前没有完成备注。",
          collection: "checklists",
          documentId: checklist.id,
          operation: "update",
          preview: `为「${checklistItemLabel(checklist.title, group.title, item.title)}」写入完成备注。`,
          timelineAffected: true,
          visibility,
        },
        timeline.change,
      ],
      rollbackAvailable: true,
      rollbackPayload: {
        // 占位预览：execute 会以写入前的真实清单快照重建该 payload。
        reason: "补备注执行后才能拿到清单分组快照与 Timeline 节点 ID，届时会补齐 beforeSnapshot。",
        strategy: "restore_checklist_groups_and_timeline",
        target: {
          collection: "checklists",
          documentId: checklist.id,
          ...(timeline.timelineEvent?.id ? { timelineEventId: timeline.timelineEvent.id } : {}),
        },
      },
    },
    type: "proposed_action",
  };
};

export const agentToolRegistry = {
  add_completion_note: {
    description: "Add a completion note to a completed checklist item and synchronize the Timeline event.",
    dryRun: addCompletionNoteDryRun,
    execute: (args, context, onTrace) => {
      if (!context.addCompletionNote) {
        throw new Error("Agent tool registry missing addCompletionNote executor.");
      }

      return context.addCompletionNote(args, onTrace);
    },
    intent: "add_completion_note",
    name: "add_completion_note",
    requiresConfirmation: true,
    riskLevel: "high",
    rollback: {
      description: "Restore the previous checklist completion note and Timeline description.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "add_completion_note", description: "Checklist title, group title, item title, and completion note text." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  append_plan_item: {
    description: "Append a new unfinished item to a resolved checklist group.",
    dryRun: appendPlanItemDryRun,
    execute: (args, context, onTrace) => {
      if (!context.appendPlanItem) {
        throw new Error("Agent tool registry missing appendPlanItem executor.");
      }

      return context.appendPlanItem(args, onTrace);
    },
    intent: "append_plan_item",
    name: "append_plan_item",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Restore the checklist groups snapshot captured before append.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "append_plan_item", description: "Checklist title, optional group title, item title, and optional description." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  cancel_schedule_item: {
    description: "Cancel an existing schedule item by setting its status to canceled.",
    dryRun: cancelScheduleItemDryRun,
    execute: (args, context, onTrace) => {
      if (!context.cancelScheduleItem) {
        throw new Error("Agent tool registry missing cancelScheduleItem executor.");
      }

      return context.cancelScheduleItem(args, onTrace);
    },
    intent: "cancel_schedule_item",
    name: "cancel_schedule_item",
    requiresConfirmation: true,
    riskLevel: "low",
    rollback: {
      description: "Restore the schedule item status to planned.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "cancel_schedule_item", description: "Schedule item ID and optional cancel reason." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  complete_plan_item: {
    description: "Mark a checklist item complete and synchronize the corresponding Timeline event.",
    dryRun: completePlanItemDryRun,
    execute: (args, context, onTrace) => {
      if (!context.completePlanItem) {
        throw new Error("Agent tool registry missing completePlanItem executor.");
      }

      return context.completePlanItem(args, onTrace);
    },
    intent: "complete_plan_item",
    name: "complete_plan_item",
    requiresConfirmation: true,
    riskLevel: "high",
    rollback: {
      description: "Restore the checklist item completion state and Timeline event snapshot.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "complete_plan_item", description: "Checklist title, group title, item title, optional completion note and completed timestamp." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  /* R6-C0-A: compose_checklist draft tool.
   * Draft capability — generates checklist preview, NO writes, NO pendingAction. */
  compose_checklist: {
    description: "Generate a checklist draft preview from a goal or item list. Draft-only — no DB write, no confirmation needed for preview.",
    dryRun: composeChecklistDryRun,
    execute: (_args, _context, _onTrace) => {
      throw new Error("compose_checklist is a draft tool — execute is not supported. Use dryRun for preview.");
    },
    intent: "compose_checklist",
    name: "compose_checklist",
    requiresConfirmation: false,
    riskLevel: "low",
    capability: "draft",
    inputSchema: { kind: "manual" as const, name: "compose_checklist", description: "Optional title, goal, and items array for generating a checklist draft preview." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: false,
    supportsRollback: false,
  },
  compose_plan: {
    description: "Compose a full executable Plan proposal and create it after confirmation.",
    dryRun: composePlanDryRun,
    execute: (args, context, onTrace) => {
      if (!context.composePlan) {
        throw new Error("Agent tool registry missing composePlan executor.");
      }

      return context.composePlan(args, onTrace);
    },
    intent: "compose_plan",
    name: "compose_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete the created plan after execution records its document id.",
      status: "planned",
    },
    capability: "draft",
    inputSchema: { kind: "manual" as const, name: "compose_plan", description: "Goal, source text, optional deadline, scope, and constraints for generating a plan proposal." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  compose_schedule_item: {
    description: "Compose a daily schedule proposal and create it after confirmation.",
    dryRun: composeScheduleItemDryRun,
    execute: (args, context, onTrace) => {
      if (!context.composeScheduleItem) {
        throw new Error("Agent tool registry missing composeScheduleItem executor.");
      }

      return context.composeScheduleItem(args, onTrace);
    },
    intent: "compose_schedule_item",
    name: "compose_schedule_item",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete the created ScheduleItem after execution records its document id.",
      status: "planned",
    },
    capability: "draft",
    inputSchema: { kind: "manual" as const, name: "compose_schedule_item", description: "Date, title, optional start/end time, description, and source plan/checklist references." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  compose_timeline_event: {
    description: "Compose a meaningful TimelineEvent proposal from content, checklist completion, plan, or free text.",
    dryRun: composeTimelineEventDryRun,
    execute: (args, context, onTrace) => {
      if (!context.composeTimelineEvent) {
        throw new Error("Agent tool registry missing composeTimelineEvent executor.");
      }

      return context.composeTimelineEvent(args, onTrace);
    },
    intent: "compose_timeline_event",
    name: "compose_timeline_event",
    requiresConfirmation: true,
    riskLevel: "high",
    rollback: {
      description: "Delete the created TimelineEvent after execution records its document id.",
      status: "planned",
    },
    capability: "draft",
    inputSchema: { kind: "manual" as const, name: "compose_timeline_event", description: "Source type, title, event date, visibility, and optional createEvent flag." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  create_checklist: {
    description: "Create a private draft checklist from an approved ChecklistDraft after confirmation.",
    dryRun: createChecklistDryRun,
    execute: (args, _context, onTrace) => createChecklistFromIntent(args, onTrace),
    intent: "create_checklist",
    name: "create_checklist",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete the created checklist after execution records its document id.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "write-schema" as const, name: "validateChecklistGroupsData" },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  create_schedule_items: {
    description: "Create multiple schedule items from an approved ScheduleDraft after confirmation.",
    dryRun: createScheduleItemsDryRun,
    execute: (args, _context, onTrace) => createScheduleItemsFromIntent(args, onTrace),
    intent: "create_schedule_items",
    name: "create_schedule_items",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete created ScheduleItems after K6 execution records their document ids.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "write-schema" as const, name: "validateScheduleItemData" },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  create_plan: {
    description: "Create a new private draft plan.",
    dryRun: createPlanDryRun,
    execute: (args, context, onTrace) => {
      if (!context.createPlan) {
        throw new Error("Agent tool registry missing createPlan executor.");
      }

      return context.createPlan(args, onTrace);
    },
    intent: "create_plan",
    name: "create_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete the created plan after execution records its document id.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "write-schema" as const, name: "validatePlanCreateData" },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  /* R5-C: Read-only schedule query tool.
   * Included in AgentWriteIntentName union for type-system compatibility only.
   * MUST remain read-only: no pendingAction, no Policy Guard, no execute, no DB write. */
  query_schedule: {
    description: "Query schedule items for a date range (today, this week, etc). Read-only — no writes, no confirmation needed.",
    dryRun: queryScheduleDryRun,
    execute: (_args, _context, _onTrace) => {
      throw new Error("query_schedule is a read-only tool — execute is not supported. Use dryRun for preview.");
    },
    intent: "query_schedule",
    name: "query_schedule",
    requiresConfirmation: false,
    riskLevel: "low",
    capability: "read",
    inputSchema: { kind: "manual" as const, name: "query_schedule", description: "Date range (today, tomorrow, this_week, next_week, upcoming) and optional startDate/endDate/limit." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: false,
    supportsRollback: false,
  },
  query_plan_progress: {
    description: "Query the progress of a specific plan including phase completion, schedule adherence, and next actions.",
    dryRun: queryPlanProgressDryRun,
    execute: (args, context, onTrace) => {
      if (!context.queryPlanProgress) {
        throw new Error("Agent tool registry missing queryPlanProgress executor.");
      }

      return context.queryPlanProgress(args, onTrace);
    },
    intent: "query_plan_progress",
    name: "query_plan_progress",
    requiresConfirmation: false,
    riskLevel: "low",
    capability: "read",
    inputSchema: { kind: "manual" as const, name: "query_plan_progress", description: "Optional plan ID or plan title to query progress for a specific plan." },
    canRunWithoutConfirmation: true,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: false,
  },
  reschedule_item: {
    description: "Reschedule an existing schedule item to a different date, time, or update its title.",
    dryRun: rescheduleItemDryRun,
    execute: (args, context, onTrace) => {
      if (!context.rescheduleItem) {
        throw new Error("Agent tool registry missing rescheduleItem executor.");
      }

      return context.rescheduleItem(args, onTrace);
    },
    intent: "reschedule_item",
    name: "reschedule_item",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Restore the schedule item to its previous date/time/title.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "reschedule_item", description: "Schedule item ID, optional new date, start time, end time, or title." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  save_memory: {
    description: "Save a distilled long-term memory such as preference, writing style, project context, workflow rule, or fact.",
    dryRun: saveMemoryDryRun,
    execute: (args, context, onTrace) => {
      if (!context.saveMemory) {
        throw new Error("Agent tool registry missing saveMemory executor.");
      }

      return context.saveMemory(args, onTrace);
    },
    intent: "save_memory",
    name: "save_memory",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Archive the created or updated memory after execution records its document id.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "write-schema" as const, name: "validateAgentMemoryData" },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  schedule_plan: {
    description: "Generate daily schedule items from a plan's phase decomposition, populating the calendar with concrete tasks.",
    dryRun: schedulePlanDryRun,
    execute: (args, context, onTrace) => {
      if (!context.schedulePlan) {
        throw new Error("Agent tool registry missing schedulePlan executor.");
      }

      return context.schedulePlan(args, onTrace);
    },
    intent: "schedule_plan",
    name: "schedule_plan",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "Delete created ScheduleItems after execution records their document ids.",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "schedule_plan", description: "Plan ID and optional start date for scheduling plan phases into calendar." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  delete_record: {
    description: "删除计划/日程/清单/时间线，需确认后执行。目前仅支持删除计划。",
    dryRun: deleteRecordDryRun,
    execute: (args, context, onTrace) => {
      if (!context.deleteRecord) {
        throw new Error("Agent tool registry missing deleteRecord executor.");
      }

      return context.deleteRecord(args, onTrace);
    },
    intent: "delete_record",
    name: "delete_record",
    requiresConfirmation: true,
    riskLevel: "high",
    rollback: {
      description: "从快照恢复已删除的计划。",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "delete_record", description: "Collection name and document ID of the record to delete." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  modify_record: {
    description: "安全修改计划、日程、清单或时间线的白名单标量字段。",
    dryRun: (args, context) =>
      modifyRecordDryRun(args, {
        createActionId: context.createActionId,
        resolveModifyRecord: context.resolveModifyRecord,
      }),
    execute: (args, context, onTrace) => {
      if (!context.modifyRecord) {
        throw new Error("Agent tool registry missing modifyRecord executor.");
      }

      return context.modifyRecord(args, onTrace);
    },
    intent: "modify_record",
    name: "modify_record",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "恢复本次修改前捕获的安全字段快照。",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "modify_record", description: "Collection, document ID, and whitelisted scalar fields to modify." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
  weekly_review: {
    description: "根据计划、清单、时间线和近期进展生成本周复盘。",
    dryRun: weeklyReviewDryRun,
    execute: (args, context, onTrace) => {
      if (!context.weeklyReview) {
        throw new Error("Agent tool registry missing weeklyReview executor.");
      }

      return context.weeklyReview(args, onTrace);
    },
    intent: "weekly_review",
    name: "weekly_review",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: {
      description: "撤销本次新建的复盘内容和行动建议，保留必要的审计记录。",
      status: "planned",
    },
    capability: "write",
    inputSchema: { kind: "manual" as const, name: "weekly_review", description: "Optional now date, persistReview flag, and createSuggestions flag." },
    canRunWithoutConfirmation: false,
    supportsDryRun: true,
    supportsExecute: true,
    supportsRollback: true,
  },
} satisfies AgentToolRegistry;

export const getAgentToolDefinition = (intent: AgentIntent["intent"]) =>
  intent in agentToolRegistry ? agentToolRegistry[intent as keyof typeof agentToolRegistry] : null;

const runAgentToolDryRun = async (intent: WritableAgentIntent, context: AgentToolDryRunContext) => {
  switch (intent.intent) {
    case "add_completion_note":
      return agentToolRegistry.add_completion_note.dryRun(intent.args, context);
    case "append_plan_item":
      return agentToolRegistry.append_plan_item.dryRun(intent.args, context);
    case "cancel_schedule_item":
      return agentToolRegistry.cancel_schedule_item.dryRun(intent.args, context);
    case "complete_plan_item":
      return agentToolRegistry.complete_plan_item.dryRun(intent.args, context);
    case "compose_checklist":
      return agentToolRegistry.compose_checklist.dryRun(intent.args as ComposeChecklistArgs, context);
    case "compose_plan":
      return agentToolRegistry.compose_plan.dryRun(intent.args, context);
    case "compose_schedule_item":
      return agentToolRegistry.compose_schedule_item.dryRun(intent.args, context);
    case "compose_timeline_event":
      return agentToolRegistry.compose_timeline_event.dryRun(intent.args, context);
    case "create_checklist":
      return agentToolRegistry.create_checklist.dryRun(intent.args, context);
    case "create_schedule_items":
      return agentToolRegistry.create_schedule_items.dryRun(intent.args, context);
    case "create_plan":
      return agentToolRegistry.create_plan.dryRun(intent.args, context);
    case "delete_record":
      return agentToolRegistry.delete_record.dryRun(intent.args, context);
    case "query_plan_progress":
      return agentToolRegistry.query_plan_progress.dryRun(intent.args, context);
    case "query_schedule":
      return agentToolRegistry.query_schedule.dryRun(intent.args as QueryScheduleArgs, context);
    case "reschedule_item":
      return agentToolRegistry.reschedule_item.dryRun(intent.args, context);
    case "save_memory":
      return agentToolRegistry.save_memory.dryRun(intent.args, context);
    case "schedule_plan":
      return agentToolRegistry.schedule_plan.dryRun(intent.args, context);
    case "weekly_review":
      return agentToolRegistry.weekly_review.dryRun(intent.args, context);
    case "modify_record":
      return agentToolRegistry.modify_record.dryRun(intent.args, context);
  }
};

export const dryRunAgentTool = async (
  intent: WritableAgentIntent,
  context: AgentToolDryRunContext = {},
): Promise<AgentToolDryRunResult> => {
  const result = await runAgentToolDryRun(intent, context);
  const definition = getAgentToolDefinition(intent.intent);

  if (!definition) {
    throw new Error(`Agent tool registry missing definition for ${intent.intent}.`);
  }

  if (result.type !== "proposed_action") {
    return result;
  }

  if (definition.capability !== "write") {
    return result;
  }

  const isSideEffectFreeWeeklyPreview =
    intent.intent === "weekly_review" &&
    intent.args.persistReview === false &&
    (result.action.affectedDocuments?.length ?? 0) === 0;

  return {
    ...result,
    action: {
      ...result.action,
      requiresConfirmation: isSideEffectFreeWeeklyPreview
        ? false
        : definition.requiresConfirmation || result.action.requiresConfirmation,
    },
  };
};

export const executeAgentTool = async (
  intent: WritableAgentIntent,
  context: AgentToolExecutionContext = {},
  onTrace?: AgentExecutionTraceReporter,
) => {
  switch (intent.intent) {
    case "add_completion_note":
      return agentToolRegistry.add_completion_note.execute(intent.args, context, onTrace);
    case "append_plan_item":
      return agentToolRegistry.append_plan_item.execute(intent.args, context, onTrace);
    case "cancel_schedule_item":
      return agentToolRegistry.cancel_schedule_item.execute(intent.args, context, onTrace);
    case "complete_plan_item":
      return agentToolRegistry.complete_plan_item.execute(intent.args, context, onTrace);
    case "compose_checklist":
      return agentToolRegistry.compose_checklist.execute(intent.args as ComposeChecklistArgs, context, onTrace);
    case "compose_plan":
      return agentToolRegistry.compose_plan.execute(intent.args, context, onTrace);
    case "compose_schedule_item":
      return agentToolRegistry.compose_schedule_item.execute(intent.args, context, onTrace);
    case "compose_timeline_event":
      return agentToolRegistry.compose_timeline_event.execute(intent.args, context, onTrace);
    case "create_checklist":
      return agentToolRegistry.create_checklist.execute(intent.args, context, onTrace);
    case "create_schedule_items":
      return agentToolRegistry.create_schedule_items.execute(intent.args, context, onTrace);
    case "create_plan":
      return agentToolRegistry.create_plan.execute(intent.args, context, onTrace);
    case "delete_record":
      return agentToolRegistry.delete_record.execute(intent.args, context, onTrace);
    case "query_plan_progress":
      return agentToolRegistry.query_plan_progress.execute(intent.args, context, onTrace);
    case "query_schedule":
      return agentToolRegistry.query_schedule.execute(intent.args as QueryScheduleArgs, context, onTrace);
    case "reschedule_item":
      return agentToolRegistry.reschedule_item.execute(intent.args, context, onTrace);
    case "save_memory":
      return agentToolRegistry.save_memory.execute(intent.args, context, onTrace);
    case "schedule_plan":
      return agentToolRegistry.schedule_plan.execute(intent.args, context, onTrace);
    case "weekly_review":
      return agentToolRegistry.weekly_review.execute(intent.args, context, onTrace);
    case "modify_record":
      return agentToolRegistry.modify_record.execute(intent.args, context, onTrace);
  }
};
