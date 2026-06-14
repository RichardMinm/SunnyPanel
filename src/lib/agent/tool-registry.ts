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
  ComposePlanArgs,
  ComposeScheduleItemArgs,
  ComposeTimelineEventArgs,
  CreatePlanArgs,
  DeleteRecordArgs,
  ModifyRecordArgs,
  PendingAction,
  ProposedAgentAction,
  QueryPlanProgressArgs,
  RescheduleItemArgs,
  ScheduleConflict,
  SchedulePlanArgs,
  SaveMemoryArgs,
  WeeklyReviewArgs,
} from "./schemas";
import { parseAgentMemoryInput } from "./memory-schema";
import {
  composePlanProposal,
  composePlanProposalFromDecomposed,
  formatPlanProposalDescription,
  isPlanComposerInputAmbiguous,
} from "./workflows/plan-composer";
import { decomposePlanRuleBased, inferDomain, normalizeComposePlanArgs, parsePlanSeedFromText } from "./workflows/plan-seed";
import { decomposePlanForCompose } from "./workflows/plan-decomposer";
import { getAgentModelConfig } from "./client";
import type { AgentPromptContext } from "./prompts";
import {
  composeScheduleProposalAsync,
  isScheduleComposerDateAmbiguous,
  toScheduleConflicts,
  type ScheduleComposerContext,
} from "./workflows/schedule-composer";
import {
  composeTimelineEventProposal,
  formatTimelineProposal,
} from "./workflows/timeline-composer";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;
type WritableAgentIntent = Extract<AgentIntent, { intent: AgentWriteIntentName }>;
type ClarifiableAgentIntentName = Exclude<AgentWriteIntentName, "compose_timeline_event" | "weekly_review">;
type ToolRiskLevel = ProposedAgentAction["riskLevel"];
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
type ResolvedChecklistItem = NonNullable<Awaited<ReturnType<ResolveChecklistItem>>["resolved"]>;
type ResolvedChecklistGroup = NonNullable<Awaited<ReturnType<ResolveChecklistGroupForAppend>>["resolved"]>;

export type AgentToolResult = {
  assistantMessage: string;
  pendingAction: null | PendingAction;
  /** 写入成功后可供 `/api/agent/rollback` 使用的结构化回滚描述（若有）。 */
  rollbackPayload?: unknown;
};

export type AgentToolDryRunContext = {
  createActionId?: () => string;
  detectScheduleConflicts?: ScheduleConflictResolver;
  findTimelineEvent?: FindTimelineEvent;
  now?: string;
  planCandidates?: PlanCandidate[];
  promptContext?: AgentPromptContext;
  resolveChecklistGroupForAppend?: ResolveChecklistGroupForAppend;
  resolveChecklistItem?: ResolveChecklistItem;
  userMessage?: string;
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
  composePlan?: (
    args: ComposePlanArgs,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  composeScheduleItem?: (
    args: ComposeScheduleItemArgs,
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
  now?: string;
  queryPlanProgress?: (
    args: QueryPlanProgressArgs,
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
  description: string;
  dryRun: (args: TArgs, context: AgentToolDryRunContext) => Promise<AgentToolDryRunResult>;
  execute: (
    args: TArgs,
    context: AgentToolExecutionContext,
    onTrace?: AgentExecutionTraceReporter,
  ) => Promise<AgentToolResult>;
  intent: TName;
  name: TName;
  requiresConfirmation: boolean;
  riskLevel: ToolRiskLevel;
  rollback?: {
    description: string;
    status: "planned";
  };
};

type AgentToolRegistry = {
  add_completion_note: AgentToolDefinition<"add_completion_note", AddCompletionNoteArgs>;
  append_plan_item: AgentToolDefinition<"append_plan_item", AppendPlanItemArgs>;
  cancel_schedule_item: AgentToolDefinition<"cancel_schedule_item", CancelScheduleItemArgs>;
  complete_plan_item: AgentToolDefinition<"complete_plan_item", CompletePlanItemArgs>;
  compose_plan: AgentToolDefinition<"compose_plan", ComposePlanArgs>;
  compose_schedule_item: AgentToolDefinition<"compose_schedule_item", ComposeScheduleItemArgs>;
  compose_timeline_event: AgentToolDefinition<"compose_timeline_event", ComposeTimelineEventArgs>;
  create_plan: AgentToolDefinition<"create_plan", CreatePlanArgs>;
  query_plan_progress: AgentToolDefinition<"query_plan_progress", QueryPlanProgressArgs>;
  reschedule_item: AgentToolDefinition<"reschedule_item", RescheduleItemArgs>;
  save_memory: AgentToolDefinition<"save_memory", SaveMemoryArgs>;
  schedule_plan: AgentToolDefinition<"schedule_plan", SchedulePlanArgs>;
  weekly_review: AgentToolDefinition<"weekly_review", WeeklyReviewArgs>;
  delete_record: AgentToolDefinition<"delete_record", DeleteRecordArgs>;
  modify_record: AgentToolDefinition<"modify_record", ModifyRecordArgs>;
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
    | ComposePlanArgs
    | ComposeScheduleItemArgs
    | CreatePlanArgs
    | QueryPlanProgressArgs
    | RescheduleItemArgs
    | SaveMemoryArgs
    | SchedulePlanArgs
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

  let decomposed = normalized.decomposed ?? decomposePlanRuleBased(normalized);

  if (!decomposed && context.promptContext) {
    decomposed = await decomposePlanForCompose(normalized, context.promptContext, getAgentModelConfig);
  }

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

const composeScheduleItemDryRun = async (
  args: ComposeScheduleItemArgs,
  context: AgentToolDryRunContext,
): Promise<AgentToolDryRunResult> => {
  let enrichedArgs = args;

  if (isScheduleComposerDateAmbiguous(enrichedArgs, context.now)) {
    const userMessage = context.userMessage?.trim() ?? "";

    if (userMessage && !isScheduleComposerDateAmbiguous({ ...enrichedArgs, sourceText: userMessage }, context.now)) {
      enrichedArgs = { ...enrichedArgs, sourceText: userMessage };
    }
  }

  // #region agent log
  fetch("http://127.0.0.1:7553/ingest/92e11e20-4501-4445-b574-f99e05456c16", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0c1aec" },
    body: JSON.stringify({
      sessionId: "0c1aec",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "tool-registry.ts:composeScheduleItemDryRun",
      message: "dry-run args after enrich",
      data: {
        argsSourceText: args.sourceText ?? null,
        enrichedSourceText: enrichedArgs.sourceText ?? null,
        userMessagePresent: Boolean(context.userMessage?.trim()),
        dateAmbiguous: isScheduleComposerDateAmbiguous(enrichedArgs, context.now),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (isScheduleComposerDateAmbiguous(enrichedArgs, context.now)) {
    return createClarifyResult({
      args,
      intent: "compose_schedule_item",
      missingFields: ["date"],
      question: "这条日程要安排到哪一天？你可以说“今天下午”“明天上午”或直接给一个日期。",
    });
  }

  const firstProposal = await composeScheduleProposalAsync(enrichedArgs, {
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
      now: context.now,
      planCandidates: context.planCandidates,
    } satisfies ScheduleComposerContext,
  );
  const nextArgs: ComposeScheduleItemArgs = {
    ...enrichedArgs,
    proposal,
  };

  // #region agent log
  fetch("http://127.0.0.1:7553/ingest/92e11e20-4501-4445-b574-f99e05456c16", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0c1aec" },
    body: JSON.stringify({
      sessionId: "0c1aec",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "tool-registry.ts:composeScheduleItemDryRun:proposed",
      message: "dry-run proposal snapshot",
      data: {
        proposalDate: proposal.date,
        proposalTitle: proposal.title,
        proposalStart: proposal.startTime ?? null,
        proposalEnd: proposal.endTime ?? null,
        nextArgsHasProposal: Boolean(nextArgs.proposal),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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

  return {
    action: {
      ...actionBase({
        args: {
          createSuggestions: args.createSuggestions !== false,
          now: args.now ?? null,
          persistReview,
        },
        context,
        intent: "weekly_review",
        riskLevel,
        summary: persistReview ? "生成并保存本周 PlanReview" : "预览本周回顾，不写入 PlanReview",
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
            createSuggestions: args.createSuggestions !== false,
            scope: "weekly_review",
          }
        : {
            scope: "weekly_review_preview",
          },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: persistReview
            ? "将创建一条整体 PlanReview，并记录对应 AgentRun。"
            : "只生成本周回顾预览，不写入数据库。",
          beforePreview: "当前尚未生成这次 Weekly Review。",
          collection: "plan-reviews",
          operation: "create",
          preview: persistReview
            ? "根据计划、清单、Timeline、公开内容和 AgentRun 生成本周回顾。"
            : "预览本周完成、风险、叙事缺口和下周建议。",
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: persistReview
        ? {
            reason: "PlanReview、AgentRun 和 AgentSuggestion 需要执行后才知道 documentId；后续可做删除/归档式回滚。",
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
      changes: [
        {
          afterPreview: targetPlan
            ? `将读取计划「${targetPlan.title}」的阶段数据、进度和关联日程。`
            : "将根据标题或 ID 查找计划并读取进度。",
          beforePreview: "当前仅知道查询意图。",
          collection: "plans",
          operation: "create",
          preview: targetPlan
            ? `查询计划「${targetPlan.title}」的阶段进度`
            : "根据标题或 ID 查询计划进度",
          timelineAffected: false,
          visibility: "private",
        },
      ],
      requiresConfirmation: false,
      rollbackAvailable: false,
    },
    type: "proposed_action",
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

  return {
    action: {
      ...actionBase({
        args,
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
        startDate: args.startDate ?? new Date().toISOString().split("T")[0],
      },
      beforeSnapshot: null,
      changes: [
        {
          afterPreview: `将根据计划的阶段拆解生成每日日程条目。`,
          beforePreview: "当前计划尚未排入日程。",
          collection: "schedule-items",
          operation: "create",
          preview: `将计划「${targetPlan.title}」的任务排入日程`,
          timelineAffected: false,
          visibility: "private",
        },
      ],
      rollbackAvailable: false,
      rollbackPayload: {
        reason: "需要在执行后才能拿到具体创建的日程条目 ID。",
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

  const changes: ProposedAgentAction["changes"] = [
    {
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
      beforeSnapshot: {
        itemId: args.itemId,
      },
      changes,
      rollbackAvailable: true,
      rollbackPayload: {
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
): Promise<AgentToolDryRunResult> => ({
  action: {
    ...actionBase({
      args,
      context,
      intent: "cancel_schedule_item",
      riskLevel: "low",
      summary: `取消日程 #${args.itemId}`,
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
      status: "planned",
    },
    changes: [
      {
        afterPreview: "日程状态将变为「已取消」。",
        beforePreview: "当前状态：planned",
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
      strategy: "restore_schedule_item_status",
      target: {
        collection: "schedule-items",
        documentId: args.itemId,
      },
    },
  },
  type: "proposed_action",
});

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
        strategy: "restore_checklist_item_and_timeline",
        target: {
          checklistId: checklist.id,
          itemId: item.id ?? null,
          timelineEventId: timeline.timelineEvent?.id ?? null,
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
        strategy: "restore_completion_note_and_timeline",
        target: {
          checklistId: checklist.id,
          itemId: item.id ?? null,
          timelineEventId: timeline.timelineEvent?.id ?? null,
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
  },
  weekly_review: {
    description: "Generate a weekly workspace review from plans, checklists, timeline events, public content, and recent AgentRuns.",
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
      description: "Delete or archive the created weekly PlanReview, AgentRun, and generated suggestions.",
      status: "planned",
    },
  },
  delete_record: {
    description: "Delete a plan, schedule, checklist, or timeline event after confirmation.",
    dryRun: async (args: DeleteRecordArgs, _context) => ({
      action: {
        args: args as unknown as Record<string, unknown>,
        changes: [{ collection: args.entityType === "plan" ? "plans" : args.entityType === "schedule" ? "schedule-items" : args.entityType === "checklist" ? "checklists" : "timeline-events", operation: "delete", preview: `删除「${args.entityName}」` }],
        id: `delete-${Date.now()}`,
        intent: "delete_record",
        requiresConfirmation: true,
        riskLevel: "high",
        summary: `删除${args.entityType === "plan" ? "计划" : args.entityType === "schedule" ? "日程" : args.entityType === "checklist" ? "清单" : "时间线"}「${args.entityName}」`,
      },
      type: "proposed_action",
    }),
    execute: async (_args, _context, _onTrace) => {
      throw new Error("delete_record execution not yet implemented");
    },
    intent: "delete_record",
    name: "delete_record",
    requiresConfirmation: true,
    riskLevel: "high",
    rollback: { description: "Restore the deleted record from backup.", status: "planned" },
  },
  modify_record: {
    description: "Modify a plan, schedule, checklist, or timeline event after confirmation.",
    dryRun: async (args: ModifyRecordArgs, _context) => ({
      action: {
        args: args as unknown as Record<string, unknown>,
        changes: [{ collection: args.entityType === "plan" ? "plans" : args.entityType === "schedule" ? "schedule-items" : args.entityType === "checklist" ? "checklists" : "timeline-events", operation: "update", preview: `修改「${args.entityName}」：${args.changeDescription}` }],
        id: `modify-${Date.now()}`,
        intent: "modify_record",
        requiresConfirmation: true,
        riskLevel: "medium",
        summary: `修改「${args.entityName}」`,
      },
      type: "proposed_action",
    }),
    execute: async (_args, _context, _onTrace) => {
      throw new Error("modify_record execution not yet implemented");
    },
    intent: "modify_record",
    name: "modify_record",
    requiresConfirmation: true,
    riskLevel: "medium",
    rollback: { description: "Restore the modified record from snapshot.", status: "planned" },
  },
} satisfies AgentToolRegistry;

export const getAgentToolDefinition = (intent: AgentIntent["intent"]) =>
  intent in agentToolRegistry ? agentToolRegistry[intent as AgentWriteIntentName] : null;

export const dryRunAgentTool = async (intent: WritableAgentIntent, context: AgentToolDryRunContext = {}) => {
  switch (intent.intent) {
    case "add_completion_note":
      return agentToolRegistry.add_completion_note.dryRun(intent.args, context);
    case "append_plan_item":
      return agentToolRegistry.append_plan_item.dryRun(intent.args, context);
    case "cancel_schedule_item":
      return agentToolRegistry.cancel_schedule_item.dryRun(intent.args, context);
    case "complete_plan_item":
      return agentToolRegistry.complete_plan_item.dryRun(intent.args, context);
    case "compose_plan":
      return agentToolRegistry.compose_plan.dryRun(intent.args, context);
    case "compose_schedule_item":
      return agentToolRegistry.compose_schedule_item.dryRun(intent.args, context);
    case "compose_timeline_event":
      return agentToolRegistry.compose_timeline_event.dryRun(intent.args, context);
    case "create_plan":
      return agentToolRegistry.create_plan.dryRun(intent.args, context);
    case "query_plan_progress":
      return agentToolRegistry.query_plan_progress.dryRun(intent.args, context);
    case "reschedule_item":
      return agentToolRegistry.reschedule_item.dryRun(intent.args, context);
    case "save_memory":
      return agentToolRegistry.save_memory.dryRun(intent.args, context);
    case "schedule_plan":
      return agentToolRegistry.schedule_plan.dryRun(intent.args, context);
    case "weekly_review":
      return agentToolRegistry.weekly_review.dryRun(intent.args, context);
    case "delete_record":
      return agentToolRegistry.delete_record.dryRun(intent.args, context);
    case "modify_record":
      return agentToolRegistry.modify_record.dryRun(intent.args, context);
  }
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
    case "compose_plan":
      return agentToolRegistry.compose_plan.execute(intent.args, context, onTrace);
    case "compose_schedule_item":
      return agentToolRegistry.compose_schedule_item.execute(intent.args, context, onTrace);
    case "compose_timeline_event":
      return agentToolRegistry.compose_timeline_event.execute(intent.args, context, onTrace);
    case "create_plan":
      return agentToolRegistry.create_plan.execute(intent.args, context, onTrace);
    case "query_plan_progress":
      return agentToolRegistry.query_plan_progress.execute(intent.args, context, onTrace);
    case "reschedule_item":
      return agentToolRegistry.reschedule_item.execute(intent.args, context, onTrace);
    case "save_memory":
      return agentToolRegistry.save_memory.execute(intent.args, context, onTrace);
    case "schedule_plan":
      return agentToolRegistry.schedule_plan.execute(intent.args, context, onTrace);
    case "weekly_review":
      return agentToolRegistry.weekly_review.execute(intent.args, context, onTrace);
    case "delete_record":
      return agentToolRegistry.delete_record.execute(intent.args, context, onTrace);
    case "modify_record":
      return agentToolRegistry.modify_record.execute(intent.args, context, onTrace);
  }
};
