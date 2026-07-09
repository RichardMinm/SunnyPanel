import { getPayloadClient } from "@/lib/payload/client";
import {
  createScheduleItem,
  type ScheduleItemInput,
  type ScheduleItemPriority,
  type ScheduleItemRecord,
  type ScheduleItemSourceType,
} from "@/lib/schedule/items";

import type { CreateScheduleItemsArgs } from "../schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

const MAX_CREATE_SCHEDULE_ITEMS = 24;
const scheduleTimePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;

type ScheduleCreatePayload = Awaited<ReturnType<typeof getPayloadClient>>;

export type CreateScheduleItemsRollbackPayload = {
  strategy: "delete_created_documents";
  target: {
    collection: "schedule-items";
    documentIds: number[];
  };
  planCleanup?: Array<{ planId: number; scheduleItemIds: number[] }>;
};

export type ScheduleItemCreateDataError = {
  code: "invalid_date" | "invalid_time" | "missing_title";
  field: string;
  message: string;
};

export type BuildScheduleItemCreateDataResult =
  | {
      data: ScheduleItemInput;
      ok: true;
    }
  | {
      error: ScheduleItemCreateDataError;
      ok: false;
    };

export type CreateScheduleItemsExecutionResult = AgentToolResult & {
  compensationErrors?: string[];
  compensationStatus?: "completed" | "failed" | "not_needed";
  createdScheduleItemIds: number[];
  dateRange: string;
  itemsCount: number;
  rollbackPayload?: CreateScheduleItemsRollbackPayload;
  status: "completed" | "failed";
  type: "create_schedule_items";
};

export type CreateScheduleItemsFromIntentOptions = {
  payload?: Pick<ScheduleCreatePayload, "create" | "delete">;
  userId?: number;
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const cleanOptional = (value: null | string | undefined): null | string =>
  normalizeText(value) || null;

const isPositiveNumber = (value: null | number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isValidTime = (value: null | string | undefined): boolean => {
  const normalized = normalizeText(value);

  return !normalized || scheduleTimePattern.test(normalized);
};

const normalizePriority = (value: null | ScheduleItemPriority | undefined): ScheduleItemPriority =>
  value === "high" || value === "low" || value === "medium" ? value : "medium";

const normalizeSourceType = (value: CreateScheduleItemsArgs["sourceType"]): ScheduleItemSourceType =>
  value === "plan" || value === "checklist" || value === "manual" ? value : "agent";

const relatedId = (
  itemValue: null | number | undefined,
  argsValue: null | number | undefined,
): null | number =>
  isPositiveNumber(itemValue)
    ? itemValue
    : isPositiveNumber(argsValue)
      ? argsValue
      : null;

const buildAgentBrief = (
  args: CreateScheduleItemsArgs,
  item: CreateScheduleItemsArgs["items"][number],
): string => {
  const sourceTaskTitle = normalizeText(item.sourceTaskTitle);
  const draftTitle = normalizeText(args.title);

  if (sourceTaskTitle && draftTitle) {
    return `来自日程草案「${draftTitle}」：${sourceTaskTitle}`;
  }

  if (sourceTaskTitle) {
    return `来自任务：${sourceTaskTitle}`;
  }

  if (draftTitle) {
    return `来自日程草案「${draftTitle}」`;
  }

  return "由 Agent 从日程草案创建。";
};

export const buildCreateScheduleItemsRollbackPayload = (
  createdScheduleItemIds: number[],
  planCleanup?: Array<{ planId: number; scheduleItemIds: number[] }>,
): CreateScheduleItemsRollbackPayload => ({
  strategy: "delete_created_documents",
  target: {
    collection: "schedule-items",
    documentIds: createdScheduleItemIds,
  },
  ...(planCleanup && planCleanup.length > 0 ? { planCleanup } : {}),
});

export const calculateCreateScheduleItemsDateRange = (
  items: Array<Pick<CreateScheduleItemsArgs["items"][number], "date">>,
): string => {
  const dates = Array.from(new Set(items.map((item) => normalizeText(item.date)).filter(Boolean))).sort();

  if (dates.length === 0) return "未确定日期";

  return dates.length === 1 ? dates[0]! : `${dates[0]} → ${dates[dates.length - 1]}`;
};

export const buildScheduleItemCreateData = (
  args: CreateScheduleItemsArgs,
  item: CreateScheduleItemsArgs["items"][number],
): BuildScheduleItemCreateDataResult => {
  const title = normalizeText(item.title);
  const date = normalizeText(item.date);
  const startTime = cleanOptional(item.startTime);
  const endTime = cleanOptional(item.endTime);

  if (!title) {
    return {
      error: {
        code: "missing_title",
        field: "title",
        message: "日程项缺少标题。",
      },
      ok: false,
    };
  }

  if (!date) {
    return {
      error: {
        code: "invalid_date",
        field: "date",
        message: "日程项缺少日期。",
      },
      ok: false,
    };
  }

  if (!isValidTime(startTime)) {
    return {
      error: {
        code: "invalid_time",
        field: "startTime",
        message: "开始时间必须使用 HH:mm 格式。",
      },
      ok: false,
    };
  }

  if (!isValidTime(endTime)) {
    return {
      error: {
        code: "invalid_time",
        field: "endTime",
        message: "结束时间必须使用 HH:mm 格式。",
      },
      ok: false,
    };
  }

  return {
    data: {
      agentBrief: buildAgentBrief(args, item),
      category: "default",
      conflictNote: cleanOptional(item.conflictNote),
      createdBy: "agent",
      date,
      description: cleanOptional(item.description),
      endTime,
      isAllDay: item.isAllDay === true,
      priority: normalizePriority(item.priority),
      relatedChecklist: relatedId(item.relatedChecklistId, args.sourceChecklistId),
      relatedChecklistItemKey: cleanOptional(item.relatedChecklistItemKey),
      relatedPlan: relatedId(item.relatedPlanId, args.sourcePlanId),
      sourceType: normalizeSourceType(args.sourceType),
      startTime,
      status: "planned",
      title,
    },
    ok: true,
  };
};

const buildValidationFailure = (
  assistantMessage: string,
  dateRange = "未确定日期",
): CreateScheduleItemsExecutionResult => ({
  assistantMessage,
  compensationStatus: "not_needed",
  createdScheduleItemIds: [],
  dateRange,
  itemsCount: 0,
  pendingAction: null,
  status: "failed",
  type: "create_schedule_items",
});

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const deleteCreatedItems = async (
  payload: Pick<ScheduleCreatePayload, "delete">,
  createdItems: Array<Pick<ScheduleItemRecord, "id">>,
): Promise<string[]> => {
  const errors: string[] = [];

  for (const item of createdItems.slice().reverse()) {
    try {
      await payload.delete({
        collection: "schedule-items",
        id: item.id,
        overrideAccess: true,
      });
    } catch (error) {
      errors.push(`schedule-items#${item.id}: ${errorMessageOf(error)}`);
    }
  }

  return errors;
};

const formatCreatedItemsPreview = (items: ScheduleItemRecord[]): string =>
  items
    .slice(0, 8)
    .map((item) => `- #${item.id} ${item.date} ${item.startTime ?? "全天"} ${item.title}`)
    .join("\n");

const buildCompensatedFailure = async ({
  createdItems,
  dateRange,
  failedMessage,
  itemsCount,
  payload,
}: {
  createdItems: ScheduleItemRecord[];
  dateRange: string;
  failedMessage: string;
  itemsCount: number;
  payload: Pick<ScheduleCreatePayload, "delete">;
}): Promise<CreateScheduleItemsExecutionResult> => {
  const compensationErrors = await deleteCreatedItems(payload, createdItems);
  const createdScheduleItemIds = createdItems.map((item) => item.id);

  if (compensationErrors.length === 0) {
    return {
      assistantMessage: `${failedMessage}已补偿删除 ${createdItems.length} 个已创建日程项。`,
      compensationErrors: [],
      compensationStatus: "completed",
      createdScheduleItemIds,
      dateRange,
      itemsCount,
      pendingAction: null,
      status: "failed",
      type: "create_schedule_items",
    };
  }

  return {
    assistantMessage: `${failedMessage}部分日程可能已创建，且未能完成补偿删除，需要人工检查：${compensationErrors.join("；")}`,
    compensationErrors,
    compensationStatus: "failed",
    createdScheduleItemIds,
    dateRange,
    itemsCount,
    pendingAction: null,
    rollbackPayload: buildCreateScheduleItemsRollbackPayload(createdScheduleItemIds),
    status: "failed",
    type: "create_schedule_items",
  };
};

export const createScheduleItemsFromIntent = async (
  args: CreateScheduleItemsArgs,
  onTrace?: AgentExecutionTraceReporter,
  options: CreateScheduleItemsFromIntentOptions = {},
): Promise<CreateScheduleItemsExecutionResult> => {
  if (!Array.isArray(args.items) || args.items.length === 0) {
    return buildValidationFailure("当前没有可创建的日程项，请先生成日程草案。");
  }

  if (args.items.length > MAX_CREATE_SCHEDULE_ITEMS) {
    return buildValidationFailure(`一次最多创建 ${MAX_CREATE_SCHEDULE_ITEMS} 个日程项，请先缩小范围。`);
  }

  const dataItems: ScheduleItemInput[] = [];
  for (const [index, item] of args.items.entries()) {
    const buildResult = buildScheduleItemCreateData(args, item);

    if (!buildResult.ok) {
      return buildValidationFailure(
        `第 ${index + 1} 个日程项无效：${buildResult.error.message}`,
        calculateCreateScheduleItemsDateRange(args.items),
      );
    }

    dataItems.push(buildResult.data);
  }

  const payload = options.payload ?? await getPayloadClient();
  const createdItems: ScheduleItemRecord[] = [];
  const dateRange = calculateCreateScheduleItemsDateRange(args.items);

  onTrace?.({
    detail: `${dataItems.length} 个日程项待创建；时间范围：${dateRange}`,
    id: "tool-create-schedule-items-prepare",
    kind: "action",
    status: "running",
    title: "准备批量创建日程",
  });

  for (const [index, data] of dataItems.entries()) {
    try {
      const created = await createScheduleItem(data, payload as never);
      createdItems.push(created);
      onTrace?.({
        detail: `${created.date} ${created.startTime ?? "全天"} ${created.title}`,
        id: `tool-create-schedule-items-created-${index + 1}`,
        kind: "write",
        status: "done",
        title: `已创建日程 #${created.id}`,
      });
    } catch (error) {
      return buildCompensatedFailure({
        createdItems,
        dateRange,
        failedMessage: `创建第 ${index + 1} 个日程项失败：${errorMessageOf(error)}。`,
        itemsCount: args.items.length,
        payload,
      });
    }
  }

  const createdScheduleItemIds = createdItems.map((item) => item.id);

  /* Update Plan.linkedContent for items with relatedPlan */
  const linkedPlanIds = new Map<number, number[]>();
  for (let i = 0; i < dataItems.length; i++) {
    const rp = dataItems[i]?.relatedPlan;
    if (typeof rp === "number" && Number.isFinite(rp) && rp > 0) {
      const ids = linkedPlanIds.get(rp) ?? [];
      ids.push(createdItems[i]!.id);
      linkedPlanIds.set(rp, ids);
    }
  }

  for (const [planId, scheduleItemIds] of linkedPlanIds) {
    try {
      const plan = await (payload as unknown as { findByID: (args: { collection: string; id: number; overrideAccess: boolean; depth: number }) => Promise<{ linkedContent?: unknown } | null> }).findByID({
        collection: "plans",
        id: planId,
        overrideAccess: true,
        depth: 0,
      });
      if (!plan) continue; /* plan not found — skip */
      const beforeContent = (plan as { linkedContent?: unknown }).linkedContent ?? [];
      const existingIds = new Set(
        (Array.isArray(beforeContent) ? beforeContent : [])
          .filter((l: unknown) => (l as { relationTo?: string }).relationTo === "schedule-items")
          .map((l: unknown) => (l as { value?: number }).value),
      );
      const newLinks = scheduleItemIds
        .filter((id) => !existingIds.has(id))
        .map((id) => ({ relationTo: "schedule-items" as const, value: id }));

      if (newLinks.length > 0) {
        await (payload as unknown as { update: (args: { collection: string; data: Record<string, unknown>; id: number; overrideAccess: boolean; depth: number }) => Promise<unknown> }).update({
          collection: "plans",
          data: { linkedContent: [...(Array.isArray(beforeContent) ? beforeContent : []), ...newLinks] },
          id: planId,
          overrideAccess: true,
          depth: 0,
        });
      }
    } catch (error) {
      return buildCompensatedFailure({
        createdItems,
        dateRange,
        failedMessage: `创建日程后关联计划 #${planId} 失败：${errorMessageOf(error)}。`,
        itemsCount: args.items.length,
        payload,
      });
    }
  }

  /* Build rollback payload with plan linkedContent cleanup info */
  const planCleanup = Array.from(linkedPlanIds.entries()).map(([planId, scheduleItemIds]) => ({
    planId,
    scheduleItemIds,
  }));
  const rollbackPayload = buildCreateScheduleItemsRollbackPayload(
    createdScheduleItemIds,
    planCleanup.length > 0 ? planCleanup : undefined,
  );

  const sourceSummary = cleanOptional(args.sourceText) ?? `从日程草案「${normalizeText(args.title) || "未命名"}」创建正式日程。`;

  try {
    await createAgentRun({
      affectedDocuments: createdItems.map((item) => ({
        collection: "schedule-items",
        documentId: item.id,
        operation: "create",
        visibility: "private",
      })),
      afterSnapshot: {
        createdScheduleItemIds,
        dateRange,
        itemsCount: createdItems.length,
        sourceChecklistId: args.sourceChecklistId ?? null,
        sourcePlanId: args.sourcePlanId ?? null,
        sourceText: args.sourceText ?? null,
        sourceType: args.sourceType ?? "agent",
        title: args.title ?? null,
      },
      agentRole: "schedule",
      beforeSnapshot: null,
      goal: sourceSummary,
      nextAction: `查看 ${dateRange} 的日程安排`,
      payload: payload as never,
      relatedPlan: args.sourcePlanId ?? undefined,
      rollbackAvailable: true,
      rollbackPayload,
      status: "succeeded",
      steps: createdItems.map((item) => ({
        level: "info" as const,
        message: `创建日程：${item.date} ${item.startTime ?? "全天"} ${item.title}`,
      })),
      summary: `Agent 已创建 ${createdItems.length} 个日程项。`,
      title: `Agent scheduled draft · ${normalizeText(args.title) || "ScheduleDraft"}`,
      userId: options.userId,
      workflow: "planning",
    });
  } catch (error) {
    return buildCompensatedFailure({
      createdItems,
      dateRange,
      failedMessage: `记录批量日程审计失败：${errorMessageOf(error)}。`,
      itemsCount: args.items.length,
      payload,
    });
  }

  onTrace?.({
    detail: `createdScheduleItemIds=${createdScheduleItemIds.join(",")}`,
    id: "tool-create-schedule-items-audit",
    kind: "write",
    status: "done",
    title: "已记录批量日程审计",
  });

  return {
    assistantMessage: [
      `已创建 ${createdItems.length} 个日程项，时间范围：${dateRange}。`,
      formatCreatedItemsPreview(createdItems),
    ].filter(Boolean).join("\n"),
    compensationStatus: "not_needed",
    createdScheduleItemIds,
    dateRange,
    itemsCount: createdItems.length,
    pendingAction: null,
    rollbackPayload,
    status: "completed",
    type: "create_schedule_items",
  };
};
