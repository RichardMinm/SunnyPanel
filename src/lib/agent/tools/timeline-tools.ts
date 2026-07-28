import type { Checklist, TimelineEvent, User } from "@/payload-types";

import {
  linkTimelineToPlan,
  resolveChecklistPlanId,
  unlinkTimelineFromPlan,
  type CoreLinkagePayload,
} from "@/lib/core-linkage/service";
import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import { markServerInternalFailedAuditCompensation } from "../internal-rollback-evidence";
import type { ComposeTimelineEventArgs } from "../schemas";
import {
  composeTimelineEventProposal,
  formatTimelineProposal,
} from "../workflows/timeline-composer";
import { validateTimelineEventData } from "../write-schemas";
import {
  createAgentRun,
  createClarifyResult,
  createOwnedRollbackToolResult,
  getTimelineComposerRelatedContent,
  type AffectedDocumentSummary,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

type TimelinePayload = Awaited<ReturnType<typeof getPayloadClient>>;

type ResolvedTimelineSource = {
  args: ComposeTimelineEventArgs;
  planId: number | null;
};

const isPersistedId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const safeFailure = (assistantMessage: string): AgentToolResult => ({
  assistantMessage,
  pendingAction: null,
  status: "failed",
});

const bindCoreLinkagePayload = (
  payload: TimelinePayload,
  userId: number,
): CoreLinkagePayload => {
  const user = { collection: "users", id: userId } as User;

  return {
    findByID: (args) =>
      payload.findByID({
        ...args,
        user,
      } as never) as never,
    update: (args) =>
      payload.update({
        ...args,
        user,
      } as never),
  };
};

const readExactSource = async (
  payload: CoreLinkagePayload,
  collection: "checklists" | "plans",
  id: number,
) => {
  try {
    const document = await payload.findByID({
      collection,
      depth: 0,
      id,
      overrideAccess: false,
    });

    return document?.id === id ? document : null;
  } catch {
    return null;
  }
};

const resolveTimelineSource = async (
  args: ComposeTimelineEventArgs,
  payload: CoreLinkagePayload,
): Promise<null | ResolvedTimelineSource> => {
  if (args.sourceType === "plan") {
    if (!isPersistedId(args.sourceId)) {
      return null;
    }

    const plan = await readExactSource(payload, "plans", args.sourceId);
    if (!plan) {
      return null;
    }

    const title =
      "title" in plan && typeof plan.title === "string" && plan.title.trim()
        ? plan.title
        : args.sourceTitle;

    return {
      args: {
        ...args,
        sourceTitle: title,
      },
      planId: args.sourceId,
    };
  }

  if (args.sourceType !== "checklist_item") {
    return {
      args,
      planId: null,
    };
  }

  if (!isPersistedId(args.sourceId) || !args.relatedTaskKey?.trim()) {
    return null;
  }

  const checklistDocument = await readExactSource(
    payload,
    "checklists",
    args.sourceId,
  );
  if (!checklistDocument) {
    return null;
  }

  const checklist = checklistDocument as unknown as Checklist;
  const planResolution = await resolveChecklistPlanId({
    checklistId: args.sourceId,
    payload,
  });
  if (
    !planResolution.ok ||
    !isPersistedId(planResolution.planId)
  ) {
    return null;
  }
  const planId = planResolution.planId;

  const taskKey = args.relatedTaskKey.trim();
  let resolvedGroupTitle: string | null = null;
  let resolvedItemTitle: string | null = null;

  for (const group of checklist.groups ?? []) {
    const item = (group.items ?? []).find((candidate) => candidate.id === taskKey);
    if (item) {
      resolvedGroupTitle = group.title;
      resolvedItemTitle = item.title;
      break;
    }
  }

  if (!resolvedItemTitle) {
    return null;
  }

  return {
    args: {
      ...args,
      checklistTitle: checklist.title,
      groupTitle: resolvedGroupTitle,
      itemTitle: resolvedItemTitle,
      relatedTaskKey: taskKey,
    },
    planId,
  };
};

const timelineRollbackPayload = (
  timelineEventId: number,
  planId: number | null,
) => ({
  strategy: "delete_created_timeline_event",
  target: {
    collection: "timeline-events",
    documentId: timelineEventId,
    ...(planId
      ? {
          planId,
          timelineEventId,
        }
      : {}),
  },
});

const compensateTimelineCreation = async ({
  corePayload,
  payload,
  planId,
  timelineEventId,
}: {
  corePayload: CoreLinkagePayload;
  payload: TimelinePayload;
  planId: number | null;
  timelineEventId: number;
}) => {
  if (planId) {
    const unlink = await unlinkTimelineFromPlan({
      payload: corePayload,
      planId,
      timelineEventId,
    });
    if (!unlink.ok) {
      return false;
    }
  }

  try {
    await payload.delete({
      collection: "timeline-events",
      id: timelineEventId,
      overrideAccess: true,
    });
    return true;
  } catch {
    return false;
  }
};

const failedWithPendingInternalCompensation = ({
  affectedDocuments,
  rollbackPayload,
}: {
  affectedDocuments: AffectedDocumentSummary[];
  rollbackPayload: unknown;
}) =>
  markServerInternalFailedAuditCompensation({
    affectedDocuments,
    assistantMessage:
      "Timeline 节点未能完整关联，系统未宣称成功；请重试或检查关联状态。",
    pendingAction: null,
    rollbackPayload,
    status: "failed" as const,
  });

export const composeTimelineEventFromIntent = async (
  args: ComposeTimelineEventArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail:
      args.sourceTitle ??
      args.sourceText ??
      args.itemTitle ??
      "等待来源信息",
    id: "tool-compose-timeline-prepare",
    kind: "analysis",
    status: "running",
    title: "正在组织 Timeline 节点提案",
  });
  const initialProposal = composeTimelineEventProposal(args);

  if (!initialProposal) {
    return args.sourceType === "plan" || args.sourceType === "checklist_item"
      ? safeFailure(
          "缺少可验证的持久化来源 ID 或条目标识，未创建 Timeline 节点。",
        )
      : createClarifyResult(
          "我还没定位到要写入 Timeline 的来源。请告诉我来源类型和标题，或直接给一段要整理成时间线节点的文字。",
        );
  }

  if (args.createEvent === false) {
    onTrace?.({
      detail: "这轮只生成提案，不写入 TimelineEvent。",
      id: "tool-compose-timeline-preview",
      kind: "complete",
      status: "done",
      title: "Timeline 提案已生成",
    });

    return {
      assistantMessage: formatTimelineProposal(initialProposal),
      pendingAction: null,
    };
  }

  const payload = await getPayloadClient();
  const needsProtectedSource =
    args.sourceType === "plan" || args.sourceType === "checklist_item";
  const userId = getCurrentAgentUserId();
  if (needsProtectedSource && !isPersistedId(userId)) {
    return safeFailure("无法验证 Timeline 来源权限，未创建 Timeline 节点。");
  }

  const corePayload = isPersistedId(userId)
    ? bindCoreLinkagePayload(payload, userId)
    : (payload as unknown as CoreLinkagePayload);
  const resolved = await resolveTimelineSource(args, corePayload);
  if (!resolved) {
    return safeFailure("指定的 Timeline 来源不可用，未创建 Timeline 节点。");
  }

  const proposal = composeTimelineEventProposal(resolved.args);
  if (!proposal) {
    return safeFailure("指定的 Timeline 来源不完整，未创建 Timeline 节点。");
  }

  const timelineSourceType =
    proposal.sourceType === "plan"
      ? "plan"
      : proposal.sourceType === "checklist_item"
        ? "checklist"
        : undefined;
  const data = validateTimelineEventData({
    description: proposal.description,
    eventDate: proposal.eventDate,
    isFeatured: proposal.isFeatured,
    ...proposal.relatedFields,
    ...(resolved.planId ? { relatedPlan: resolved.planId } : {}),
    ...(timelineSourceType ? { sourceType: timelineSourceType } : {}),
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

  const rollbackPayload = timelineRollbackPayload(
    timelineEvent.id,
    resolved.planId,
  );
  const affectedDocuments: AffectedDocumentSummary[] = [
    {
      collection: "timeline-events",
      documentId: timelineEvent.id,
      operation: "create",
      visibility: timelineEvent.visibility,
    },
  ];

  let planLinkChanged = false;
  if (resolved.planId) {
    const link = await linkTimelineToPlan({
      payload: corePayload,
      planId: resolved.planId,
      timelineEventId: timelineEvent.id,
    });
    if (!link.ok) {
      const compensated = await compensateTimelineCreation({
        corePayload,
        payload,
        planId: resolved.planId,
        timelineEventId: timelineEvent.id,
      });
      return compensated
        ? safeFailure("Timeline 节点未能安全关联到 Plan，创建已撤销。")
        : failedWithPendingInternalCompensation({
            affectedDocuments,
            rollbackPayload,
          });
    }

    if (link.changed) {
      planLinkChanged = true;
      affectedDocuments.push({
        collection: "plans",
        documentId: resolved.planId,
        operation: "update",
        visibility: "unknown",
      });
    }
  }

  let agentRun: Awaited<ReturnType<typeof createAgentRun>>;
  try {
    agentRun = await createAgentRun({
      affectedDocuments,
      afterSnapshot: {
        planLinkChanged,
        planId: resolved.planId,
        proposal,
        timelineEventId: timelineEvent.id,
      },
      beforeSnapshot: null,
      payload,
      relatedContent: getTimelineComposerRelatedContent(
        resolved.args,
        timelineEvent.id,
      ),
      relatedPlan: resolved.planId ?? undefined,
      rollbackAvailable: true,
      rollbackPayload,
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
  } catch (error) {
    if (!resolved.planId) {
      throw error;
    }

    const compensated = await compensateTimelineCreation({
      corePayload,
      payload,
      planId: resolved.planId,
      timelineEventId: timelineEvent.id,
    });
    return compensated
      ? safeFailure("Timeline 节点审计记录写入失败，创建与关联已撤销。")
      : failedWithPendingInternalCompensation({
          affectedDocuments,
          rollbackPayload,
        });
  }

  onTrace?.({
    detail: "本次 Timeline Composer 写入已记录到 AgentRun。",
    id: "tool-compose-timeline-audit",
    kind: "complete",
    status: "done",
    title: "已记录审计日志",
  });

  return createOwnedRollbackToolResult({
    affectedDocuments,
    assistantMessage: `已创建 TimelineEvent #${timelineEvent.id}：${timelineEvent.title}\n${proposal.reason}`,
    pendingAction: null,
    rollbackSourceRunId: agentRun.id,
    rollbackPayload,
  });
};
