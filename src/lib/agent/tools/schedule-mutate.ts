import { getPayloadClient } from "@/lib/payload/client";
import type { Plan } from "@/payload-types";
import {
  updateScheduleItemStatus,
  type ScheduleItemRecord,
} from "@/lib/schedule/items";

import type { CancelScheduleItemArgs, RescheduleItemArgs, SchedulePlanArgs } from "../schemas";
import type { FrozenSchedulePlanProposal } from "../schedule/model-schemas";
import {
  createAgentRun,
  createOwnedRollbackToolResult,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

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

type SchedulePlanPayload = Awaited<ReturnType<typeof getPayloadClient>>;
type SchedulePlanAudit = Awaited<ReturnType<typeof createAgentRun>>;
type SchedulePlanCreatedItem = import("../workflows/plan-schedule-link").CreatedSchedulePlanItem;

export type SchedulePlanExecutionDependencies = {
  getPayloadClientFn?: typeof getPayloadClient;
  isProposalSafeFn?: (
    proposal: FrozenSchedulePlanProposal,
    payload: SchedulePlanPayload,
    plan: Plan,
  ) => Promise<boolean>;
  persistExecutionFn?: (
    plan: Plan,
    proposal: FrozenSchedulePlanProposal,
    dependencies: { payload: SchedulePlanPayload },
  ) => Promise<{ audit: SchedulePlanAudit; items: SchedulePlanCreatedItem[] }>;
};

export const schedulePlanFromIntent = async (
  args: SchedulePlanArgs,
  onTrace?: AgentExecutionTraceReporter,
  dependencies: SchedulePlanExecutionDependencies = {},
): Promise<AgentToolResult> => {
  if (!args.proposal || args.proposal.planId !== args.planId) {
    return {
      assistantMessage: "这次排期没有可验证的确认草案，未创建任何日程。请重新生成排期预览后再确认。",
      pendingAction: null,
      status: "failed",
    };
  }
  const proposal = args.proposal;

  const payload = await (dependencies.getPayloadClientFn ?? getPayloadClient)();
  const plan = await payload.findByID({
    collection: "plans",
    disableErrors: true,
    id: args.planId,
    overrideAccess: true,
  });

  if (!plan) {
    return {
      assistantMessage: `找不到 ID 为 ${args.planId} 的计划。请确认计划 ID 是否正确。`,
      pendingAction: null,
      status: "failed",
    };
  }

  const {
    isFrozenSchedulePlanProposalCurrentlySafe,
    persistFrozenSchedulePlanProposalWithAudit,
    summarizeScheduleGeneration,
  } = await import("../workflows/plan-schedule-link");
  const proposalSafe = dependencies.isProposalSafeFn
    ? await dependencies.isProposalSafeFn(proposal, payload, plan)
    : await isFrozenSchedulePlanProposalCurrentlySafe(
        proposal,
        payload as never,
        plan,
      );
  if (!proposalSafe) {
    return {
      assistantMessage: `计划「${plan.title}」的排期草案已与当前日程冲突或失效，未创建任何日程。请重新生成预览。`,
      pendingAction: null,
      status: "failed",
    };
  }

  onTrace?.({
    detail: `${proposal.items.length} 条已确认日程待写入`,
    id: "tool-schedule-plan-prepare",
    kind: "action",
    status: "running",
    title: `准备执行「${plan.title}」的确认排期`,
  });

  const startDate = proposal.startDate;
  const execution = dependencies.persistExecutionFn
    ? await dependencies.persistExecutionFn(plan, proposal, { payload })
    : await persistFrozenSchedulePlanProposalWithAudit(
        plan,
        proposal,
        (items, transactionPayload) => createAgentRun({
          affectedDocuments: items.map((item) => ({
            collection: "schedule-items",
            documentId: item.id,
            operation: "create",
            visibility: "private",
          })),
          afterSnapshot: {
            planFingerprint: proposal.planFingerprint,
            planId: plan.id,
            planTitle: plan.title,
            scheduleCount: items.length,
            startDate,
          },
          beforeSnapshot: null,
          goal: `将计划「${plan.title}」的任务排入日程`,
          nextAction: `查看 ${startDate} 的日程安排`,
          payload: transactionPayload as never,
          relatedPlan: plan.id,
          rollbackAvailable: true,
          rollbackPayload: buildDeleteCreatedScheduleItemsRollbackPayload(items),
          status: "succeeded",
          steps: items.map((item) => ({
            level: "info" as const,
            message: `${item.date} ${item.title}`,
          })),
          summary: `Agent 已从计划「${plan.title}」生成 ${items.length} 条日程`,
          title: `Agent scheduled plan · ${plan.title}`,
          workflow: "planning",
        }),
        { payload: payload as never },
      );
  const { audit: agentRun, items } = execution;

  onTrace?.({
    detail: summarizeScheduleGeneration(items),
    id: "tool-schedule-plan-created",
    kind: "write",
    status: "done",
    title: `已生成 ${items.length} 条日程`,
  });

  return createOwnedRollbackToolResult({
    assistantMessage: `已将计划「${plan.title}」排入日程，共生成 ${items.length} 条：\n${items
      .slice(0, 10)
      .map((item) => `- ${item.date} ${item.title}`)
      .join("\n")}${items.length > 10 ? `\n...等共 ${items.length} 条` : ""}`,
    pendingAction: null,
    rollbackPayload: buildDeleteCreatedScheduleItemsRollbackPayload(items),
    rollbackSourceRunId: agentRun.id,
  });
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

  const agentRun = await createAgentRun({
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

  return createOwnedRollbackToolResult({
    assistantMessage: `已将「${updated.title}」改期至 ${updated.date} ${updated.startTime ?? ""}${updated.endTime ? `-${updated.endTime}` : ""}。`,
    pendingAction: null,
    rollbackPayload,
    rollbackSourceRunId: agentRun.id,
  });
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

  const updated = await updateScheduleItemStatus(
    args.itemId,
    "canceled",
    payload as unknown as NonNullable<
      Parameters<typeof updateScheduleItemStatus>[2]
    >,
  );
  const rollbackPayload = buildScheduleItemStatusRollbackPayload(item, updated.id);

  onTrace?.({
    detail: `status: ${item.status} → canceled`,
    id: "tool-cancel-schedule-done",
    kind: "write",
    status: "done",
    title: "日程已取消",
  });

  const agentRun = await createAgentRun({
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

  return createOwnedRollbackToolResult({
    assistantMessage: args.reason
      ? `已取消日程「${item.title}」（${args.reason}）。`
      : `已取消日程「${item.title}」。`,
    pendingAction: null,
    rollbackPayload,
    rollbackSourceRunId: agentRun.id,
  });
};
