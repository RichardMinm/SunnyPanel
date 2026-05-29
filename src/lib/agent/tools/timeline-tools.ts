import type { TimelineEvent } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import type { ComposeTimelineEventArgs } from "../schemas";
import { composeTimelineEventProposal, formatTimelineProposal } from "../workflows/timeline-composer";
import { validateTimelineEventData } from "../write-schemas";
import {
  createAgentRun,
  createClarifyResult,
  getTimelineComposerRelatedContent,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

export const composeTimelineEventFromIntent = async (
  args: ComposeTimelineEventArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.sourceTitle ?? args.sourceText ?? args.itemTitle ?? "等待来源信息",
    id: "tool-compose-timeline-prepare",
    kind: "analysis",
    status: "running",
    title: "正在组织 Timeline 节点提案",
  });
  const proposal = composeTimelineEventProposal(args);

  if (!proposal) {
    return createClarifyResult("我还没定位到要写入 Timeline 的来源。请告诉我来源类型和标题，或直接给一段要整理成时间线节点的文字。");
  }

  const proposalMessage = formatTimelineProposal(proposal);

  if (args.createEvent === false) {
    onTrace?.({
      detail: "这轮只生成提案，不写入 TimelineEvent。",
      id: "tool-compose-timeline-preview",
      kind: "complete",
      status: "done",
      title: "Timeline 提案已生成",
    });

    return {
      assistantMessage: proposalMessage,
      pendingAction: null,
    };
  }

  const payload = await getPayloadClient();
  const data = validateTimelineEventData({
    description: proposal.description,
    eventDate: proposal.eventDate,
    isFeatured: proposal.isFeatured,
    ...proposal.relatedFields,
    sortOrder: 0,
    status: proposal.status,
    title: proposal.title,
    type: proposal.type,
    visibility: proposal.visibility,
  });
  onTrace?.({
    detail: `visibility=${proposal.visibility}，featured=${proposal.isFeatured ? "yes" : "no"}`,
    id: "tool-compose-timeline-write",
    kind: "write",
    status: "running",
    title: "正在创建 TimelineEvent",
  });
  const timelineEvent = (await payload.create({
    collection: "timeline-events",
    data,
    overrideAccess: true,
  })) as TimelineEvent;
  onTrace?.({
    detail: `TimelineEvent #${timelineEvent.id}`,
    id: "tool-compose-timeline-written",
    kind: "write",
    status: "done",
    title: "TimelineEvent 已创建",
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "timeline-events",
        documentId: timelineEvent.id,
        operation: "create",
        visibility: timelineEvent.visibility,
      },
    ],
    afterSnapshot: {
      id: timelineEvent.id,
      proposal,
    },
    beforeSnapshot: null,
    relatedContent: getTimelineComposerRelatedContent(args, timelineEvent.id),
    relatedPlan: args.sourceType === "plan" && args.sourceId ? args.sourceId : undefined,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "delete_created_timeline_event",
      target: {
        collection: "timeline-events",
        documentId: timelineEvent.id,
      },
    },
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `已创建 TimelineEvent #${timelineEvent.id}：${timelineEvent.title}`,
      },
      {
        level: proposal.visibility === "public" ? "warn" : "info",
        message: proposal.reason,
      },
    ],
    summary: `Agent 已把 ${proposal.relatedContentLabel} 组织成 Timeline 节点「${timelineEvent.title}」。`,
    title: `Agent composed timeline event · ${timelineEvent.title}`,
    workflow: "sync",
  });
  onTrace?.({
    detail: "本次 Timeline Composer 写入已记录到 AgentRun。",
    id: "tool-compose-timeline-audit",
    kind: "complete",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已创建 TimelineEvent #${timelineEvent.id}：${timelineEvent.title}\n${proposal.reason}`,
    pendingAction: null,
    rollbackPayload: {
      strategy: "delete_created_timeline_event",
      target: {
        collection: "timeline-events",
        documentId: timelineEvent.id,
      },
    },
  };
};

