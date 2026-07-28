import type { Checklist, User } from "@/payload-types";

import {
  completeChecklistItemByKey,
  type ChecklistCompletionPayload,
} from "@/lib/core-linkage/checklist-completion";
import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import type { AppendPlanItemArgs, CompletePlanItemArgs } from "../schemas";
import { validateChecklistGroupsData } from "../write-schemas";
import {
  cloneChecklistGroups,
  resolveChecklistGroupForAppend,
  resolveChecklistItem,
} from "../checklist-resolvers";
import {
  buildChecklistGroupsAndTimelineRollbackPayload,
  buildChecklistGroupsRollbackPayload,
} from "./checklist-rollback";
import {
  buildChecklistItemLabel,
  createAgentRun,
  createClarifyResult,
  scoreTextMatch,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

const bindChecklistCompletionPayload = (
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
): ChecklistCompletionPayload => {
  const userId = getCurrentAgentUserId();
  const user = typeof userId === "number" && Number.isInteger(userId) && userId > 0
    ? ({ collection: "users", id: userId } as User)
    : undefined;
  const withUser = <T extends Record<string, unknown>>(args: T) =>
    user ? { ...args, user } : args;

  return {
    create: (args) => payload.create(withUser(args) as never),
    delete: (args) => payload.delete(withUser(args) as never),
    find: (args) => payload.find(withUser(args) as never),
    findByID: (args) => payload.findByID(withUser(args) as never),
    update: (args) => payload.update(withUser(args) as never),
  } as ChecklistCompletionPayload;
};

export const appendPlanItemFromIntent = async (
  args: AppendPlanItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.groupTitle ? `${args.checklistTitle} / ${args.groupTitle}` : args.checklistTitle,
    id: "tool-append-item-locate-group",
    kind: "analysis",
    status: "running",
    title: `正在定位要追加条目的清单分组`,
  });
  const target = await resolveChecklistGroupForAppend(args);

  if (!target.resolved) {
    if (args.createGroupIfMissing && args.groupTitle && target.checklist) {
      const checklist = target.checklist as Checklist;
      const rollbackPayload = buildChecklistGroupsRollbackPayload(checklist.id, cloneChecklistGroups(checklist.groups));
      const groups = cloneChecklistGroups(checklist.groups);
      const groupIndex = groups.length;

      groups.push({
        items: [
          {
            description: args.description ?? null,
            isCompleted: false,
            title: args.itemTitle,
          },
        ],
        title: args.groupTitle,
      });

      const payload = await getPayloadClient();
      const validatedGroups = validateChecklistGroupsData(groups);
      onTrace?.({
        detail: `将新建分组「${args.groupTitle}」并新增条目「${args.itemTitle}」`,
        id: "tool-append-item-create-group",
        kind: "write",
        status: "running",
        title: "正在新建清单分组",
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

      if (!updatedGroup) {
        throw new Error("Updated checklist group could not be resolved after creating the missing group.");
      }

      onTrace?.({
        detail: `${updatedChecklist.title} / ${updatedGroup.title}`,
        id: "tool-append-item-create-group-done",
        kind: "write",
        status: "done",
        title: "清单分组与计划项已写入",
      });

      await createAgentRun({
        affectedDocuments: [
          {
            collection: "checklists",
            documentId: updatedChecklist.id,
            operation: "update",
            visibility: updatedChecklist.visibility,
          },
        ],
        afterSnapshot: {
          checklistId: updatedChecklist.id,
          createdGroup: true,
          groupTitle: updatedGroup.title,
          itemTitle: args.itemTitle,
          operation: "append_plan_item",
        },
        beforeSnapshot: {
          checklistId: checklist.id,
          groupCount: checklist.groups?.length ?? 0,
          missingGroupTitle: args.groupTitle,
        },
        relatedContent: [
          {
            relationTo: "checklists",
            value: updatedChecklist.id,
          },
        ],
        rollbackAvailable: true,
        rollbackPayload,
        status: "succeeded",
        steps: [
          {
            level: "info",
            message: `已新建分组并追加计划项：${updatedChecklist.title} / ${updatedGroup.title} / ${args.itemTitle}`,
          },
        ],
        summary: `Agent 已为 ${updatedChecklist.title} 新建分组并追加一条计划项。`,
        title: `Agent created checklist group · ${args.groupTitle}`,
        workflow: "planning",
      });
      onTrace?.({
        detail: "本次新建分组动作已经进入 AgentRun。",
        id: "tool-append-item-create-group-audit",
        kind: "write",
        status: "done",
        title: "已记录审计日志",
      });

      return {
        assistantMessage: `已新建分组「${updatedGroup.title}」，并把「${args.itemTitle}」追加到「${updatedChecklist.title} / ${updatedGroup.title}」。`,
        pendingAction: null,
        rollbackPayload,
      };
    }

    const assistantMessage = target.question ?? "我还没定位到要追加计划项的清单分组。";

    return {
      assistantMessage,
      pendingAction: args.groupTitle
        ? null
        : {
            args,
            intent: "append_plan_item",
            missingFields: ["groupTitle"],
            question: assistantMessage,
            type: "await_clarification",
          },
    };
  }

  const { checklist, group, groupIndex } = target.resolved;
  const rollbackPayload = buildChecklistGroupsRollbackPayload(checklist.id, cloneChecklistGroups(checklist.groups));
  onTrace?.({
    detail: `${checklist.title} / ${group.title}`,
    id: "tool-append-item-group-found",
    kind: "analysis",
    status: "done",
    title: "已定位清单分组",
  });
  const existingItem = (group.items ?? []).find((item) => scoreTextMatch(item.title, args.itemTitle) >= 80);

  if (existingItem) {
    return createClarifyResult(
      `${buildChecklistItemLabel(checklist.title, group.title, existingItem.title)} 已经存在。你要补的是另一条更具体的计划项吗？`,
    );
  }

  const groups = cloneChecklistGroups(checklist.groups);

  groups[groupIndex] = {
    ...groups[groupIndex]!,
    items: [
      ...(groups[groupIndex]?.items ?? []),
      {
        description: args.description ?? null,
        isCompleted: false,
        title: args.itemTitle,
      },
    ],
  };

  const payload = await getPayloadClient();
  const validatedGroups = validateChecklistGroupsData(groups);
  onTrace?.({
    detail: `将新增条目「${args.itemTitle}」`,
    id: "tool-append-item-write",
    kind: "write",
    status: "running",
    title: "正在更新清单",
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

  if (!updatedGroup) {
    throw new Error("Updated checklist group could not be resolved after appending the plan item.");
  }
  onTrace?.({
    detail: `${updatedChecklist.title} / ${updatedGroup.title}`,
    id: "tool-append-item-done",
    kind: "write",
    status: "done",
    title: "计划项已写入清单",
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "checklists",
        documentId: updatedChecklist.id,
        operation: "update",
        visibility: updatedChecklist.visibility,
      },
    ],
    afterSnapshot: {
      checklistId: updatedChecklist.id,
      groupTitle: updatedGroup.title,
      itemTitle: args.itemTitle,
      operation: "append_plan_item",
    },
    beforeSnapshot: {
      checklistId: checklist.id,
      groupItemCount: group.items?.length ?? 0,
      groupTitle: group.title,
    },
    relatedContent: [
      {
        relationTo: "checklists",
        value: updatedChecklist.id,
      },
    ],
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已追加计划项：${updatedChecklist.title} / ${updatedGroup.title} / ${args.itemTitle}`,
      },
    ],
    summary: `Agent 已为 ${updatedChecklist.title} 追加一条计划项。`,
    title: `Agent appended checklist item · ${args.itemTitle}`,
    workflow: "planning",
  });
  onTrace?.({
    detail: "本次追加动作已经进入 AgentRun。",
    id: "tool-append-item-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已把「${args.itemTitle}」追加到「${updatedChecklist.title} / ${updatedGroup.title}」。`,
    pendingAction: null,
    rollbackPayload,
  };
};

export const completePlanItemFromIntent = async (
  args: CompletePlanItemArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.groupTitle ? `${args.checklistTitle} / ${args.groupTitle} / ${args.itemTitle}` : `${args.checklistTitle} / ${args.itemTitle}`,
    id: "tool-complete-item-locate",
    kind: "analysis",
    status: "running",
    title: "正在匹配要完成的条目",
  });
  const target = await resolveChecklistItem(args);

  if (!target.resolved) {
    const assistantMessage = target.question ?? "我还没定位到要完成的清单条目。";

    return {
      assistantMessage,
      pendingAction: args.groupTitle
        ? null
        : {
            args,
            intent: "complete_plan_item",
            missingFields: ["groupTitle"],
            question: assistantMessage,
            type: "await_clarification",
          },
    };
  }

  const {
    checklist,
    group,
    groupIndex,
    item,
    itemIndex,
    itemReferenceKey,
  } = target.resolved;
  onTrace?.({
    detail: `${checklist.title} / ${group.title} / ${item.title}`,
    id: "tool-complete-item-found",
    kind: "analysis",
    status: "done",
    title: "已定位目标条目",
  });

  if (item.isCompleted && !args.completionNote) {
    return {
      assistantMessage: `${buildChecklistItemLabel(checklist.title, group.title, item.title)} 已经是完成状态了。要不要我顺手补一句完成备注？`,
      pendingAction: {
        checklistTitle: checklist.title,
        groupTitle: group.title,
        itemTitle: item.title,
        type: "await_completion_note",
      },
    };
  }

  const nextCompletedAt = args.completedAt ?? item.completedAt ?? new Date().toISOString();
  const nextCompletionNote = args.completionNote ?? item.completionNote ?? null;

  const payload = await getPayloadClient();
  onTrace?.({
    detail: `完成时间：${nextCompletedAt}`,
    id: "tool-complete-item-write",
    kind: "write",
    status: "running",
    title: "正在更新清单完成状态",
  });
  const completion = await completeChecklistItemByKey({
    checklistId: checklist.id,
    completedAt: nextCompletedAt,
    completionNote: nextCompletionNote,
    itemKey: itemReferenceKey,
    payload: bindChecklistCompletionPayload(payload),
  });

  if (!completion.ok) {
    onTrace?.({
      detail: completion.safeMessage,
      id: "tool-complete-item-failed",
      kind: "error",
      status: "error",
      title: "清单完成联动未能安全写入",
    });

    return {
      assistantMessage: completion.safeMessage,
      pendingAction: null,
      status: "failed",
    };
  }

  const updatedChecklist = completion.checklist;
  const updatedGroup = updatedChecklist.groups?.[groupIndex];
  const updatedItem = updatedGroup?.items?.[itemIndex];

  if (!updatedGroup || !updatedItem) {
    throw new Error("Updated checklist item could not be resolved after completion.");
  }
  onTrace?.({
    detail: `${updatedChecklist.title} / ${updatedGroup.title} / ${updatedItem.title}`,
    id: "tool-complete-item-updated",
    kind: "write",
    status: "done",
    title: "清单状态已更新",
  });

  onTrace?.({
    detail: "会把完成记录映射成时间线节点，方便公开叙事承接。",
    id: "tool-complete-item-timeline",
    kind: "action",
    status: "running",
    title: "正在同步时间线节点",
  });
  const timelineEvent = completion.timelineEvent;
  onTrace?.({
    detail: timelineEvent ? `TimelineEvent #${timelineEvent.id}` : "没有生成可同步的时间线节点。",
    id: "tool-complete-item-timeline-done",
    kind: "write",
    status: "done",
    title: "时间线同步完成",
  });
  const rollbackPayload = buildChecklistGroupsAndTimelineRollbackPayload(
    updatedChecklist.id,
    completion.beforeGroups,
    completion.previousTimelineEvent as null | Record<string, unknown>,
    timelineEvent.id,
    {
      planId: completion.planId,
      planLinkChanged: completion.planLinkChanged,
      planLinkedContent: completion.planLinkedContent,
    },
  );

  await createAgentRun({
    affectedDocuments: completion.affectedDocuments,
    afterSnapshot: {
      checklistId: updatedChecklist.id,
      completedAt: updatedItem.completedAt ?? null,
      completionNote: updatedItem.completionNote ?? null,
      isCompleted: updatedItem.isCompleted,
      itemId: updatedItem.id ?? null,
      timelineEventId: timelineEvent.id,
    },
    beforeSnapshot: {
      checklistId: checklist.id,
      completedAt: item.completedAt ?? null,
      completionNote: item.completionNote ?? null,
      isCompleted: Boolean(item.isCompleted),
      itemId: item.id ?? null,
    },
    relatedContent: [
      {
        relationTo: "checklists",
        value: updatedChecklist.id,
      },
      {
        relationTo: "timeline-events" as const,
        value: timelineEvent.id,
      },
    ],
    relatedPlan: completion.planId ?? undefined,
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已标记完成：${updatedChecklist.title} / ${updatedGroup.title} / ${updatedItem.title}`,
      },
    ],
    summary: `Agent 已标记 ${updatedChecklist.title} 的条目完成，并同步到 Timeline。`,
    title: `Agent completed checklist item · ${updatedItem.title}`,
    workflow: "sync",
  });
  onTrace?.({
    detail: "完成动作已经落入 AgentRun，可回看执行痕迹。",
    id: "tool-complete-item-audit",
    kind: "complete",
    status: "done",
    title: "已记录审计日志",
  });

  if (args.completionNote) {
    return {
      assistantMessage: `已把 ${buildChecklistItemLabel(updatedChecklist.title, updatedGroup.title, updatedItem.title)} 标记完成，并把备注一起写进去了。对应 Timeline 节点也已经同步。`,
      pendingAction: null,
      rollbackPayload,
    };
  }

  // 不再无条件挂起 await_completion_note 阻塞后续流程（尤其是复合编排）。
  // 完成动作本身已是终态；如果用户想补备注，可在后续消息里直接说，意图系统会路由到 add_completion_note。
  return {
    assistantMessage: `已把 ${buildChecklistItemLabel(updatedChecklist.title, updatedGroup.title, updatedItem.title)} 标记完成，对应 Timeline 节点也已同步。如果想补一句完成备注或感受，告诉我就好。`,
    pendingAction: null,
    rollbackPayload,
  };
};
