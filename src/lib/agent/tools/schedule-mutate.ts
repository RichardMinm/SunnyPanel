import { getPayloadClient } from "@/lib/payload/client";
import { updateScheduleItemStatus, type ScheduleItemRecord } from "@/lib/schedule/items";

import type { CancelScheduleItemArgs, RescheduleItemArgs, SchedulePlanArgs } from "../schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

const relationId = (value: ScheduleItemRecord["relatedChecklist"] | ScheduleItemRecord["relatedPlan"]) =>
  typeof value === "number" ? value : value?.id ?? null;

const scheduleSnapshot = (item: ScheduleItemRecord) => ({
  ...(item.agentBrief !== undefined ? { agentBrief: item.agentBrief } : {}),
  ...(item.conflictNote !== undefined ? { conflictNote: item.conflictNote } : {}),
  date: item.date,
  ...(item.description !== undefined ? { description: item.description } : {}),
  endTime: item.endTime ?? null,
  isAllDay: item.isAllDay,
  priority: item.priority,
  relatedChecklist: relationId(item.relatedChecklist),
  relatedChecklistItemKey: item.relatedChecklistItemKey ?? null,
  relatedPlan: relationId(item.relatedPlan),
  sourceType: item.sourceType,
  startTime: item.startTime ?? null,
  status: item.status,
  title: item.title,
});

export const buildDeleteCreatedScheduleItemsRollbackPayload = (
  items: Array<Pick<ScheduleItemRecord, "id">>,
) => ({
  strategy: "delete_created_documents",
  target: {
    collection: "schedule-items",
    documentIds: items.map((item) => item.id),
  },
});

export const buildScheduleItemSnapshotRollbackPayload = (item: ScheduleItemRecord, documentId = item.id) => ({
  beforeSnapshot: scheduleSnapshot(item),
  strategy: "restore_schedule_item_snapshot",
  target: {
    collection: "schedule-items",
    documentId,
  },
});

export const buildScheduleItemStatusRollbackPayload = (item: Pick<ScheduleItemRecord, "id" | "status">, documentId = item.id) => ({
  beforeSnapshot: {
    status: item.status,
  },
  strategy: "restore_schedule_item_status",
  target: {
    collection: "schedule-items",
    documentId,
  },
});

export const schedulePlanFromIntent = async (
  args: SchedulePlanArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const payload = await getPayloadClient();
  const plan = await payload.findByID({
    collection: "plans",
    id: args.planId,
    overrideAccess: true,
  });

  if (!plan) {
    return {
      assistantMessage: `找不到 ID 为 ${args.planId} 的计划。请确认计划 ID 是否正确。`,
      pendingAction: null,
    };
  }

  const phases = plan.phases as
    | Array<{ title: string; goal: string; estimatedDays: number; milestones: Array<{ title: string; tasks: string[]; estimatedHours: number }> }>
    | null
    | undefined;

  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    return {
      assistantMessage: `计划「${plan.title}」还没有阶段拆解数据。你可以先说「为${plan.title}制定计划」让 Agent 重新拆解。`,
      pendingAction: null,
    };
  }

  const { generateScheduleFromPlan, summarizeScheduleGeneration } =
    await import("../workflows/plan-schedule-link");

  onTrace?.({
    detail: `${phases.length} 个阶段待排入日程`,
    id: "tool-schedule-plan-prepare",
    kind: "action",
    status: "running",
    title: `准备为「${plan.title}」生成日程`,
  });

  const startDate = args.startDate || new Date().toISOString().split("T")[0];
  const items = await generateScheduleFromPlan(plan, phases, {
    startDate,
    defaultStartTime: args.defaultStartTime || "09:00",
    defaultDurationMinutes: args.defaultDurationMinutes ?? 90,
  });

  onTrace?.({
    detail: summarizeScheduleGeneration(items),
    id: "tool-schedule-plan-created",
    kind: "write",
    status: "done",
    title: `已生成 ${items.length} 条日程`,
  });

  await createAgentRun({
    affectedDocuments: items.map((item) => ({
      collection: "schedule-items",
      documentId: item.id,
      operation: "create",
      visibility: "private",
    })),
    afterSnapshot: {
      planId: plan.id,
      planTitle: plan.title,
      scheduleCount: items.length,
      startDate,
    },
    beforeSnapshot: null,
    goal: `将计划「${plan.title}」的任务排入日程`,
    nextAction: `查看 ${startDate} 的日程安排`,
    relatedPlan: plan.id,
    rollbackAvailable: true,
    rollbackPayload: buildDeleteCreatedScheduleItemsRollbackPayload(items),
    status: "succeeded",
    steps: items.map((item) => ({
      level: "info" as const,
      message: `${item.date} [${item.phaseTitle}] ${item.title}`,
    })),
    summary: `Agent 已从计划「${plan.title}」生成 ${items.length} 条日程`,
    title: `Agent scheduled plan · ${plan.title}`,
    workflow: "planning",
  });

  return {
    assistantMessage: `已将计划「${plan.title}」排入日程，共生成 ${items.length} 条：\n${items
      .slice(0, 10)
      .map((item) => `- ${item.date} [${item.phaseTitle}] ${item.title}`)
      .join("\n")}${items.length > 10 ? `\n...等共 ${items.length} 条` : ""}`,
    pendingAction: null,
    rollbackPayload: buildDeleteCreatedScheduleItemsRollbackPayload(items),
  };
};

export const rescheduleItemFromIntent = async (
  args: RescheduleItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const payload = await getPayloadClient();
  const item = await payload.findByID({
    collection: "schedule-items",
    id: args.itemId,
    overrideAccess: true,
  }) as ScheduleItemRecord | null;

  if (!item) {
    return {
      assistantMessage: `找不到 ID 为 ${args.itemId} 的日程。请确认 ID 是否正确。`,
      pendingAction: null,
    };
  }

  onTrace?.({
    detail: `原：${item.date} ${item.startTime ?? "?"}-${item.endTime ?? "?"} ${item.title}`,
    id: "tool-reschedule-prepare",
    kind: "action",
    status: "running",
    title: `准备改期日程「${item.title}」`,
  });

  const updateData: Record<string, unknown> = {};
  if (args.newDate) updateData.date = args.newDate;
  if (args.newStartTime !== undefined) updateData.startTime = args.newStartTime ?? null;
  if (args.newEndTime !== undefined) updateData.endTime = args.newEndTime ?? null;
  if (args.newTitle !== undefined) updateData.title = args.newTitle;

  const updated = await payload.update({
    collection: "schedule-items",
    data: updateData,
    id: args.itemId,
    overrideAccess: true,
  }) as ScheduleItemRecord;
  const rollbackPayload = buildScheduleItemSnapshotRollbackPayload(item, updated.id);

  onTrace?.({
    detail: `已改为：${updated.date} ${updated.startTime ?? "?"}-${updated.endTime ?? "?"} ${updated.title}`,
    id: "tool-reschedule-done",
    kind: "write",
    status: "done",
    title: "日程已改期",
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "schedule-items",
        documentId: updated.id,
        operation: "update",
        visibility: "private",
      },
    ],
    afterSnapshot: {
      date: updated.date,
      endTime: updated.endTime,
      id: updated.id,
      startTime: updated.startTime,
      title: updated.title,
    },
    beforeSnapshot: {
      date: item.date,
      endTime: item.endTime,
      id: item.id,
      startTime: item.startTime,
      title: item.title,
    },
    relatedPlan: typeof item.relatedPlan === "number" ? item.relatedPlan : undefined,
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: args.reason
          ? `已将「${item.title}」改期：${args.reason}`
          : `已将「${item.title}」改期至 ${updated.date} ${updated.startTime ?? ""}${updated.endTime ? `-${updated.endTime}` : ""}`,
      },
    ],
    summary: `Agent 已改期日程「${updated.title}」`,
    title: `Agent rescheduled item · ${updated.title}`,
    workflow: "planning",
  });

  return {
    assistantMessage: `已将「${updated.title}」改期至 ${updated.date} ${updated.startTime ?? ""}${updated.endTime ? `-${updated.endTime}` : ""}。`,
    pendingAction: null,
    rollbackPayload,
  };
};

export const cancelScheduleItemFromIntent = async (
  args: CancelScheduleItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const payload = await getPayloadClient();
  const item = await payload.findByID({
    collection: "schedule-items",
    id: args.itemId,
    overrideAccess: true,
  }) as ScheduleItemRecord | null;

  if (!item) {
    return {
      assistantMessage: `找不到 ID 为 ${args.itemId} 的日程。`,
      pendingAction: null,
    };
  }

  onTrace?.({
    detail: args.reason ?? "用户请求取消",
    id: "tool-cancel-schedule-prepare",
    kind: "action",
    status: "running",
    title: `准备取消日程「${item.title}」`,
  });

  const updated = await updateScheduleItemStatus(args.itemId, "canceled");
  const rollbackPayload = buildScheduleItemStatusRollbackPayload(item, updated.id);

  onTrace?.({
    detail: `status: ${item.status} → canceled`,
    id: "tool-cancel-schedule-done",
    kind: "write",
    status: "done",
    title: "日程已取消",
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "schedule-items",
        documentId: updated.id,
        operation: "update",
        visibility: "private",
      },
    ],
    afterSnapshot: {
      id: updated.id,
      status: "canceled",
      title: updated.title,
    },
    beforeSnapshot: {
      id: item.id,
      status: item.status,
      title: item.title,
    },
    relatedPlan: typeof item.relatedPlan === "number" ? item.relatedPlan : undefined,
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: args.reason
          ? `已取消日程「${item.title}」：${args.reason}`
          : `已取消日程「${item.title}」`,
      },
    ],
    summary: `Agent 已取消日程「${item.title}」`,
    title: `Agent canceled item · ${item.title}`,
    workflow: "planning",
  });

  return {
    assistantMessage: args.reason
      ? `已取消日程「${item.title}」（${args.reason}）。`
      : `已取消日程「${item.title}」。`,
    pendingAction: null,
    rollbackPayload,
  };
};
