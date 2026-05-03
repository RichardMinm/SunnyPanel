import type { AgentRun, Checklist, TimelineEvent } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import type {
  AddCompletionNoteArgs,
  AgentTraceStep,
  AppendPlanItemArgs,
  CompletePlanItemArgs,
  CreatePlanArgs,
  PendingAction,
} from "./schemas";
import {
  validateAgentRunData,
  validateChecklistGroupsData,
  validatePlanCreateData,
  validateTimelineEventData,
} from "./write-schemas";

type ChecklistGroup = NonNullable<Checklist["groups"]>[number];
type ChecklistItem = NonNullable<ChecklistGroup["items"]>[number];

export type AgentToolResult = {
  assistantMessage: string;
  pendingAction: null | PendingAction;
};

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

const normalizeForSearch = (value: string) =>
  value.toLowerCase().replace(/[\s\-_/·，。！？、:：；;（）()]/g, "");

const scoreTextMatch = (candidate: string, query: string) => {
  const normalizedCandidate = normalizeForSearch(candidate);
  const normalizedQuery = normalizeForSearch(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (normalizedCandidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedCandidate)) {
    return 80;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return 60;
  }

  return 0;
};

const buildChecklistItemLabel = (checklistTitle: string, groupTitle: null | string | undefined, itemTitle: string) =>
  groupTitle ? `「${checklistTitle} / ${groupTitle} / ${itemTitle}」` : `「${checklistTitle} / ${itemTitle}」`;

const buildTimelineTitle = (checklistTitle: string, groupTitle: null | string | undefined, itemTitle: string) =>
  groupTitle ? `${checklistTitle} · ${groupTitle} / ${itemTitle} 完成` : `${checklistTitle} · ${itemTitle} 完成`;

const buildTimelineDescription = (item: ChecklistItem) =>
  [item.description, item.completionNote]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");

const createAgentRun = async ({
  relatedContent,
  relatedPlan,
  status,
  steps,
  summary,
  title,
  workflow,
}: {
  relatedContent?: NonNullable<AgentRun["relatedContent"]>;
  relatedPlan?: number;
  status: NonNullable<AgentRun["status"]>;
  steps: Array<{
    level: "error" | "info" | "warn";
    message: string;
  }>;
  summary: string;
  title: string;
  workflow: NonNullable<AgentRun["workflow"]>;
}) => {
  const payload = await getPayloadClient();
  const startedAt = new Date().toISOString();
  const data = validateAgentRunData({
    completedAt: startedAt,
    goal: summary,
    relatedContent,
    relatedPlan,
    startedAt,
    status,
    steps: steps.map((step) => ({
      level: step.level,
      message: step.message,
      recordedAt: startedAt,
    })),
    summary,
    title,
    trigger: "agent",
    workflow,
  });

  await payload.create({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data,
    overrideAccess: true,
  });
};

const createClarifyResult = (assistantMessage: string): AgentToolResult => ({
  assistantMessage,
  pendingAction: null,
});

const findChecklist = async (checklistTitle: string) => {
  const payload = await getPayloadClient();
  const checklists = await payload.find({
    collection: "checklists",
    depth: 0,
    limit: 100,
    overrideAccess: true,
    sort: "-updatedAt",
  });
  const scoredMatches = checklists.docs
    .map((doc) => ({
      doc,
      score: scoreTextMatch(doc.title, checklistTitle),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      checklist: null,
      question: `我没找到「${checklistTitle}」这份清单。你可以告诉我更准确的清单名。`,
    };
  }

  if (scoredMatches.length > 1 && scoredMatches[0]?.score === scoredMatches[1]?.score) {
    return {
      checklist: null,
      question: `我找到了多份接近「${checklistTitle}」的清单：${scoredMatches
        .slice(0, 3)
        .map((item) => item.doc.title)
        .join("、")}。你想操作哪一份？`,
    };
  }

  return {
    checklist: scoredMatches[0]?.doc ?? null,
    question: null,
  };
};

const resolveChecklistItem = async ({
  checklistTitle,
  groupTitle,
  itemTitle,
}: {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
}) => {
  const checklistResult = await findChecklist(checklistTitle);

  if (!checklistResult.checklist) {
    return {
      question: checklistResult.question ?? "我还没找到对应的清单。",
      resolved: null,
    };
  }

  const checklist = checklistResult.checklist;
  const candidates = (checklist.groups ?? []).flatMap((group, groupIndex) =>
    (group.items ?? []).map((item, itemIndex) => {
      const itemScore = scoreTextMatch(item.title, itemTitle);
      const groupScore = groupTitle ? scoreTextMatch(group.title, groupTitle) : 0;

      return {
        group,
        groupIndex,
        item,
        itemIndex,
        score: groupTitle ? itemScore + groupScore : itemScore,
      };
    }),
  );
  const filtered = candidates
    .filter((candidate) => candidate.score > 0 && (!groupTitle || scoreTextMatch(candidate.group.title, groupTitle) > 0))
    .sort((a, b) => b.score - a.score);

  if (filtered.length === 0) {
    const groupHint = groupTitle ? `${groupTitle} / ` : "";

    return {
      question: `我在「${checklist.title}」里没找到「${groupHint}${itemTitle}」这个条目。你可以告诉我更准确的分组名或条目名。`,
      resolved: null,
    };
  }

  if (filtered.length > 1 && filtered[0]?.score === filtered[1]?.score) {
    return {
      question: `我在「${checklist.title}」里找到了多个接近「${itemTitle}」的条目：${filtered
        .slice(0, 3)
        .map((candidate) => `${candidate.group.title} / ${candidate.item.title}`)
        .join("、")}。你想操作哪一个？`,
      resolved: null,
    };
  }

  return {
    question: null,
    resolved: {
      checklist,
      group: filtered[0]!.group,
      groupIndex: filtered[0]!.groupIndex,
      item: filtered[0]!.item,
      itemIndex: filtered[0]!.itemIndex,
    },
  };
};

const resolveChecklistGroupForAppend = async ({
  checklistTitle,
  groupTitle,
}: {
  checklistTitle: string;
  groupTitle?: null | string;
}) => {
  const checklistResult = await findChecklist(checklistTitle);

  if (!checklistResult.checklist) {
    return {
      question: checklistResult.question ?? "我还没找到对应的清单。",
      resolved: null,
    };
  }

  const checklist = checklistResult.checklist;
  const groups = checklist.groups ?? [];

  if (groups.length === 0) {
    return {
      question: `「${checklist.title}」里还没有分组。请先告诉我要把条目放在哪个分组里。`,
      resolved: null,
    };
  }

  if (!groupTitle) {
    if (groups.length === 1) {
      return {
        question: null,
        resolved: {
          checklist,
          group: groups[0]!,
          groupIndex: 0,
        },
      };
    }

    return {
      question: `「${checklist.title}」有多个分组：${groups
        .slice(0, 5)
        .map((group) => group.title)
        .join("、")}。这条计划项要放到哪个分组？`,
      resolved: null,
    };
  }

  const scoredMatches = groups
    .map((group, groupIndex) => ({
      group,
      groupIndex,
      score: scoreTextMatch(group.title, groupTitle),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      question: `我在「${checklist.title}」里没找到「${groupTitle}」这个分组。你可以告诉我更准确的分组名。`,
      resolved: null,
    };
  }

  if (scoredMatches.length > 1 && scoredMatches[0]?.score === scoredMatches[1]?.score) {
    return {
      question: `我在「${checklist.title}」里找到了多个接近「${groupTitle}」的分组：${scoredMatches
        .slice(0, 3)
        .map((item) => item.group.title)
        .join("、")}。你想放到哪一个？`,
      resolved: null,
    };
  }

  return {
    question: null,
    resolved: {
      checklist,
      group: scoredMatches[0]!.group,
      groupIndex: scoredMatches[0]!.groupIndex,
    },
  };
};

const cloneChecklistGroups = (groups: Checklist["groups"]) =>
  (groups ?? []).map((group) => ({
    ...group,
    items: (group.items ?? []).map((item) => ({
      ...item,
    })),
  }));

const upsertChecklistTimelineEvent = async ({
  checklist,
  group,
  item,
}: {
  checklist: Checklist;
  group: ChecklistGroup;
  item: ChecklistItem;
}) => {
  if (!item.id || !item.isCompleted) {
    return null;
  }

  const payload = await getPayloadClient();
  const existingEvent = await payload.find({
    collection: "timeline-events",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        {
          relatedChecklist: {
            equals: checklist.id,
          },
        },
        {
          relatedTaskKey: {
            equals: item.id,
          },
        },
      ],
    },
  });
  const data = validateTimelineEventData({
    description: buildTimelineDescription(item),
    eventDate: item.completedAt || new Date().toISOString(),
    isFeatured: false,
    relatedChecklist: checklist.id,
    relatedTaskKey: item.id,
    sortOrder: 0,
    status: checklist.status,
    title: buildTimelineTitle(checklist.title, group.title, item.title),
    type: "project" as const,
    visibility: checklist.visibility,
  });

  if (existingEvent.docs[0]) {
    return (await payload.update({
      collection: "timeline-events",
      data,
      id: existingEvent.docs[0].id,
      overrideAccess: true,
    })) as TimelineEvent;
  }

  return (await payload.create({
    collection: "timeline-events",
    data,
    overrideAccess: true,
  })) as TimelineEvent;
};

export const createPlanFromIntent = async (
  args: CreatePlanArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.description ?? "没有额外描述，稍后可在计划详情里补充。",
    id: "tool-create-plan-prepare",
    kind: "action",
    status: "running",
    title: `准备创建计划「${args.title}」`,
  });
  const payload = await getPayloadClient();
  const data = validatePlanCreateData({
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
  });
  const createdPlan = await payload.create({
    collection: "plans",
    data,
    overrideAccess: true,
  });
  onTrace?.({
    detail: `计划已写入草稿区，默认执行模式为 ${data.executionMode === "agent" ? "Agent 主导" : data.executionMode === "hybrid" ? "协作推进" : "人工推进"}。`,
    id: "tool-create-plan-created",
    kind: "write",
    status: "done",
    title: `已创建计划记录 #${createdPlan.id}`,
  });

  await createAgentRun({
    relatedPlan: createdPlan.id,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `创建计划：${createdPlan.title}`,
      },
    ],
    summary: `Agent 已创建计划「${createdPlan.title}」。`,
    title: `Agent created plan · ${createdPlan.title}`,
    workflow: "planning",
  });
  onTrace?.({
    detail: "本次创建动作已经写入 AgentRun 审计记录。",
    id: "tool-create-plan-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已帮你创建计划「${createdPlan.title}」。目前它会以私有草稿的形式进入待办队列，默认状态是“待开始”。`,
    pendingAction: null,
  };
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
    relatedContent: [
      {
        relationTo: "checklists",
        value: updatedChecklist.id,
      },
    ],
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

  const { checklist, group, groupIndex, item, itemIndex } = target.resolved;
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

  const groups = cloneChecklistGroups(checklist.groups);
  const nextCompletedAt = args.completedAt ?? item.completedAt ?? new Date().toISOString();
  const nextCompletionNote = args.completionNote ?? item.completionNote ?? null;

  groups[groupIndex]!.items![itemIndex] = {
    ...groups[groupIndex]!.items![itemIndex]!,
    completedAt: nextCompletedAt,
    completionNote: nextCompletionNote,
    isCompleted: true,
  };

  const payload = await getPayloadClient();
  const validatedGroups = validateChecklistGroupsData(groups);
  onTrace?.({
    detail: `完成时间：${nextCompletedAt}`,
    id: "tool-complete-item-write",
    kind: "write",
    status: "running",
    title: "正在更新清单完成状态",
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
  const timelineEvent = await upsertChecklistTimelineEvent({
    checklist: updatedChecklist,
    group: updatedGroup,
    item: updatedItem,
  });
  onTrace?.({
    detail: timelineEvent ? `TimelineEvent #${timelineEvent.id}` : "没有生成可同步的时间线节点。",
    id: "tool-complete-item-timeline-done",
    kind: "write",
    status: "done",
    title: "时间线同步完成",
  });

  await createAgentRun({
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
    };
  }

  return {
    assistantMessage: `已把 ${buildChecklistItemLabel(updatedChecklist.title, updatedGroup.title, updatedItem.title)} 标记完成。要不要再补一句完成备注或感受？`,
    pendingAction: {
      checklistTitle: updatedChecklist.title,
      groupTitle: updatedGroup.title,
      itemTitle: updatedItem.title,
      type: "await_completion_note",
    },
  };
};

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

  await createAgentRun({
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

  return {
    assistantMessage: `已把备注补到 ${buildChecklistItemLabel(updatedChecklist.title, updatedGroup.title, updatedItem.title)} 上，并同步更新了 Timeline 说明。`,
    pendingAction: null,
  };
};
