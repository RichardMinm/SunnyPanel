import { createScheduleItem } from "@/lib/schedule/items";

import type { ComposeScheduleItemArgs } from "../schemas";
import { composeScheduleProposal } from "../workflows/schedule-composer";
import { validateScheduleItemData } from "../write-schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const composeScheduleItemFromIntent = async (
  args: ComposeScheduleItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  // #region agent log
  fetch("http://127.0.0.1:7553/ingest/92e11e20-4501-4445-b574-f99e05456c16", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0c1aec" },
    body: JSON.stringify({
      sessionId: "0c1aec",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "schedule-compose.ts:composeScheduleItemFromIntent",
      message: "execute entry args",
      data: {
        hasProposal: Boolean(args.proposal),
        sourceText: args.sourceText ?? null,
        date: args.date ?? null,
        title: args.title ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const proposal = composeScheduleProposal(args);
  const timeRange = proposal.isAllDay
    ? "全天"
    : [proposal.startTime, proposal.endTime].filter(Boolean).join("-") || "未定时间";

  // #region agent log
  fetch("http://127.0.0.1:7553/ingest/92e11e20-4501-4445-b574-f99e05456c16", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0c1aec" },
    body: JSON.stringify({
      sessionId: "0c1aec",
      runId: "pre-fix",
      hypothesisId: "C",
      location: "schedule-compose.ts:composeScheduleItemFromIntent:proposal",
      message: "execute composed proposal",
      data: {
        proposalDate: proposal.date,
        proposalTitle: proposal.title,
        timeRange,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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

