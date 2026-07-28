import type { Checklist } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import type { AddCompletionNoteArgs } from "../schemas";
import { validateChecklistGroupsData } from "../write-schemas";
import {
  cloneChecklistGroups,
  findChecklistTimelineEvent,
  resolveChecklistItem,
  upsertChecklistTimelineEvent,
} from "../checklist-resolvers";
import { buildChecklistGroupsAndTimelineRollbackPayload } from "./checklist-rollback";
import {
  buildChecklistItemLabel,
  createAgentRun,
  createClarifyResult,
  createOwnedRollbackToolResult,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

export const addCompletionNoteFromIntent = async (
  args: AddCompletionNoteArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.groupTitle ? `${args.checklistTitle} / ${args.groupTitle} / ${args.itemTitle}` : `${args.checklistTitle} / ${args.itemTitle}`,
    id: "tool-note-locate",
    kind: "analysis",
    status: "running",
    title: "正在定位要补备注的完成条目",
  });
  const target = await resolveChecklistItem(args);

  if (!target.resolved) {
    return createClarifyResult(target.question ?? "我还没定位到要补备注的条目。");
  }

  const { checklist, group, groupIndex, item, itemIndex } = target.resolved;
  const beforeGroups = cloneChecklistGroups(checklist.groups);
  onTrace?.({
    detail: `${checklist.title} / ${group.title} / ${item.title}`,
    id: "tool-note-found",
    kind: "analysis",
    status: "done",
    title: "已定位目标条目",
  });

  if (!item.isCompleted) {
    return createClarifyResult(`${buildChecklistItemLabel(checklist.title, group.title, item.title)} 还没被标记完成。你要不要先让我帮你把它标记完成？`);
  }

  const groups = cloneChecklistGroups(checklist.groups);

  groups[groupIndex]!.items![itemIndex] = {
    ...groups[groupIndex]!.items![itemIndex]!,
    completionNote: args.completionNote,
  };

  const payload = await getPayloadClient();
  const validatedGroups = validateChecklistGroupsData(groups);
  onTrace?.({
    detail: "会把新的完成备注同时写回清单与时间线说明。",
    id: "tool-note-write",
    kind: "write",
    status: "running",
    title: "正在写入完成备注",
  });
  const updatedChecklist = (await payload.update({
    collection: "checklists",
    data: {
      groups: validatedGroups,
    },
    id: checklist.id,
    overrideAccess: true,
  })) as Checklist;
  const updatedGroup = updatedChecklist.groups?.[groupIndex];
  const updatedItem = updatedGroup?.items?.[itemIndex];

  if (!updatedGroup || !updatedItem) {
    throw new Error("Updated checklist item could not be resolved after adding the completion note.");
  }
  onTrace?.({
    detail: `${updatedChecklist.title} / ${updatedGroup.title} / ${updatedItem.title}`,
    id: "tool-note-updated",
    kind: "write",
    status: "done",
    title: "清单备注已更新",
  });

  onTrace?.({
    detail: "保持清单和公开时间线说明一致。",
    id: "tool-note-timeline",
    kind: "action",
    status: "running",
    title: "正在同步时间线说明",
  });
  const previousTimelineEvent = await findChecklistTimelineEvent({
    checklist,
    item,
  });
  const timelineEvent = await upsertChecklistTimelineEvent({
    checklist: updatedChecklist,
    group: updatedGroup,
    item: updatedItem,
  });
  onTrace?.({
    detail: timelineEvent ? `TimelineEvent #${timelineEvent.id}` : "没有可同步的时间线节点。",
    id: "tool-note-timeline-done",
    kind: "write",
    status: "done",
    title: "时间线说明已同步",
  });
  const rollbackPayload = buildChecklistGroupsAndTimelineRollbackPayload(
    updatedChecklist.id,
    beforeGroups,
    previousTimelineEvent as null | Record<string, unknown>,
    timelineEvent?.id ?? previousTimelineEvent?.id ?? null,
  );

  const agentRun = await createAgentRun({
    affectedDocuments: [
      {
        collection: "checklists",
        documentId: updatedChecklist.id,
        operation: "update",
        visibility: updatedChecklist.visibility,
      },
      ...(timelineEvent
        ? [
            {
              collection: "timeline-events",
              documentId: timelineEvent.id,
              operation: "update",
              visibility: timelineEvent.visibility,
            },
          ]
        : []),
    ],
    afterSnapshot: {
      checklistId: updatedChecklist.id,
      completionNote: updatedItem.completionNote ?? null,
      itemId: updatedItem.id ?? null,
      timelineEventId: timelineEvent?.id ?? null,
    },
    beforeSnapshot: {
      checklistId: checklist.id,
      completionNote: item.completionNote ?? null,
      itemId: item.id ?? null,
    },
    relatedContent: [
      {
        relationTo: "checklists",
        value: updatedChecklist.id,
      },
      ...(timelineEvent
        ? [
            {
              relationTo: "timeline-events" as const,
              value: timelineEvent.id,
            },
          ]
        : []),
    ],
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已补完成备注：${updatedChecklist.title} / ${updatedGroup.title} / ${updatedItem.title}`,
      },
    ],
    summary: `Agent 已为 ${updatedChecklist.title} 的完成条目补上备注，并同步 Timeline 说明。`,
    title: `Agent added completion note · ${updatedItem.title}`,
    workflow: "sync",
  });
  onTrace?.({
    detail: "备注补充动作已进入 AgentRun 审计记录。",
    id: "tool-note-audit",
    kind: "complete",
    status: "done",
    title: "已记录审计日志",
  });

  return createOwnedRollbackToolResult({
    assistantMessage: `已把备注补到 ${buildChecklistItemLabel(updatedChecklist.title, updatedGroup.title, updatedItem.title)} 上，并同步更新了 Timeline 说明。`,
    pendingAction: null,
    rollbackPayload,
    rollbackSourceRunId: agentRun.id,
  });
};
