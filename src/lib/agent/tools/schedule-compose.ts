import { createScheduleItem } from "@/lib/schedule/items";

import type { ComposeScheduleItemArgs } from "../schemas";
import { composeScheduleProposal } from "../workflows/schedule-composer";
import { validateScheduleItemData } from "../write-schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const composeScheduleItemFromIntent = async (
  args: ComposeScheduleItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const proposal = composeScheduleProposal(args);
  const timeRange = proposal.isAllDay
    ? "全天"
    : [proposal.startTime, proposal.endTime].filter(Boolean).join("-") || "未定时间";

  onTrace?.({
    detail: `${proposal.date} ${timeRange}`,
    id: "tool-compose-schedule-prepare",
    kind: "action",
    status: "running",
    title: `准备创建日程「${proposal.title}」`,
  });
  const data = validateScheduleItemData({
    agentBrief: proposal.reason,
    conflictNote:
      proposal.conflicts.length > 0
        ? `创建时检测到冲突：${proposal.conflicts.map((item) => item.title).join("；")}`
        : null,
    createdBy: "agent",
    date: proposal.date,
    description: proposal.description ?? proposal.reason,
    endTime: proposal.endTime ?? null,
    isAllDay: proposal.isAllDay,
    priority: proposal.priority,
    relatedChecklist: proposal.relatedChecklistId ?? null,
    relatedChecklistItemKey: proposal.relatedChecklistItemKey ?? null,
    relatedPlan: proposal.relatedPlanId ?? null,
    sourceType: proposal.relatedPlanId ? "plan" : proposal.relatedChecklistId ? "checklist" : "agent",
    startTime: proposal.startTime ?? null,
    status: "planned",
    title: proposal.title,
  });
  const createdScheduleItem = await createScheduleItem(data);

  onTrace?.({
    detail: proposal.conflicts.length > 0 ? "已带冲突备注写入，后续仍可改期。" : "没有检测到冲突。",
    id: "tool-compose-schedule-created",
    kind: "write",
    status: "done",
    title: `已创建日程 #${createdScheduleItem.id}`,
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "schedule-items",
        documentId: createdScheduleItem.id,
        operation: "create",
        visibility: "private",
      },
    ],
    afterSnapshot: {
      id: createdScheduleItem.id,
      proposal,
      title: createdScheduleItem.title,
    },
    beforeSnapshot: null,
    goal: proposal.reason,
    nextAction: `${proposal.date} ${timeRange} 执行「${proposal.title}」`,
    relatedPlan: proposal.relatedPlanId ?? undefined,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "schedule-items",
        documentId: createdScheduleItem.id,
      },
    },
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `创建日程：${proposal.date} ${timeRange} ${proposal.title}`,
      },
    ],
    summary: `Agent 已创建日程「${proposal.title}」。`,
    title: `Agent scheduled item · ${proposal.title}`,
    workflow: "planning",
  });

  onTrace?.({
    detail: "日程创建动作已经写入 AgentRun 审计记录。",
    id: "tool-compose-schedule-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已创建日程「${createdScheduleItem.title}」：${proposal.date} ${timeRange}。`,
    pendingAction: null,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "schedule-items",
        documentId: createdScheduleItem.id,
      },
    },
  };
};

