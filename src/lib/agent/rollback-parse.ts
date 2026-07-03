import { isRecord } from "@/lib/shared/is-record";
export type RollbackPayload = {
  beforeSnapshot?: unknown;
  reason?: string;
  strategy: string;
  target?: {
    agentRunId?: null | number;
    beforeLinkedContent?: unknown;
    checklistId?: null | number;
    collection?: string;
    documentId?: null | number;
    documentIds?: number[];
    expectedAddedLink?: unknown;
    planReviewId?: null | number;
    planId?: null | number;
    suggestionIds?: number[];
    timelineEventId?: null | number;
  };
};


export const parseRollbackPayload = (value: unknown): null | RollbackPayload => {
  if (!isRecord(value)) {
    return null;
  }

  const strategy = typeof value.strategy === "string" ? value.strategy : null;

  if (!strategy) {
    return null;
  }

  const target = isRecord(value.target)
    ? {
        agentRunId:
          typeof value.target.agentRunId === "number" ? value.target.agentRunId : undefined,
        beforeLinkedContent: Array.isArray(value.target.beforeLinkedContent)
          ? value.target.beforeLinkedContent
          : undefined,
        checklistId:
          typeof value.target.checklistId === "number" ? value.target.checklistId : undefined,
        collection: typeof value.target.collection === "string" ? value.target.collection : undefined,
        documentId:
          typeof value.target.documentId === "number"
            ? value.target.documentId
            : value.target.documentId === null
              ? null
              : undefined,
        documentIds: Array.isArray(value.target.documentIds)
          ? value.target.documentIds.filter((id): id is number => typeof id === "number")
          : undefined,
        planReviewId:
          typeof value.target.planReviewId === "number" ? value.target.planReviewId : undefined,
        planId:
          typeof value.target.planId === "number" ? value.target.planId : undefined,
        expectedAddedLink: isRecord(value.target.expectedAddedLink) ? value.target.expectedAddedLink : undefined,
        suggestionIds: Array.isArray(value.target.suggestionIds)
          ? value.target.suggestionIds.filter((id): id is number => typeof id === "number")
          : undefined,
        timelineEventId:
          typeof value.target.timelineEventId === "number"
            ? value.target.timelineEventId
            : value.target.timelineEventId === null
              ? null
              : undefined,
      }
    : undefined;
  const hasExecutableTarget =
    Boolean(target?.collection) ||
    (strategy === "delete_created_checklist_and_restore_plan_links" &&
      typeof target?.checklistId === "number" &&
      typeof target?.planId === "number");

  return {
    beforeSnapshot: isRecord(value.beforeSnapshot) ? value.beforeSnapshot : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    strategy,
    target: hasExecutableTarget ? target : undefined,
  };
};

/** 与 `executeRollbackFromPayload` 支持的自动回滚范围对齐（纯函数，供 UI 判断是否展示按钮）。 */
export const isRollbackPayloadExecutable = (value: unknown): boolean => {
  const parsed = parseRollbackPayload(value);

  if (!parsed?.target) {
    return false;
  }

  if (parsed.strategy === "delete_created_checklist_and_restore_plan_links") {
    return (
      typeof parsed.target.checklistId === "number" &&
      typeof parsed.target.planId === "number" &&
      parsed.target.expectedAddedLink != null
    );
  }

  if (!parsed.target.collection) {
    return false;
  }

  const { collection, documentId, documentIds } = parsed.target;

  if (parsed.strategy === "delete_created_weekly_review_artifacts") {
    return typeof parsed.target.planReviewId === "number";
  }

  if (parsed.strategy === "delete_created_document") {
    return (
      typeof documentId === "number" &&
      (collection === "plans" || collection === "schedule-items" || collection === "checklists")
    );
  }

  if (parsed.strategy === "delete_created_documents") {
    return (
      (collection === "plans" || collection === "schedule-items") &&
      Array.isArray(documentIds) &&
      documentIds.length > 0
    );
  }

  if (parsed.strategy === "delete_created_timeline_event") {
    return typeof documentId === "number" && collection === "timeline-events";
  }

  if (parsed.strategy === "archive_created_memory") {
    return typeof documentId === "number" && collection === "agent-memories";
  }

  if (parsed.strategy === "restore_checklist_groups") {
    return typeof documentId === "number" && collection === "checklists" && parsed.beforeSnapshot != null;
  }

  if (parsed.strategy === "restore_checklist_groups_and_timeline") {
    const snapshot = parsed.beforeSnapshot as { groups?: unknown } | undefined;

    return (
      typeof documentId === "number" &&
      collection === "checklists" &&
      Array.isArray(snapshot?.groups)
    );
  }

  if (parsed.strategy === "restore_schedule_item_snapshot" || parsed.strategy === "restore_schedule_item_status") {
    return typeof documentId === "number" && collection === "schedule-items" && parsed.beforeSnapshot != null;
  }

  if (parsed.strategy === "restore_deleted_plan") {
    const snapshot = parsed.beforeSnapshot as { title?: unknown } | undefined;
    return (
      typeof documentId === "number" &&
      collection === "plans" &&
      typeof snapshot?.title === "string"
    );
  }

  if (parsed.strategy === "restore_deleted_schedule_item") {
    const snapshot = parsed.beforeSnapshot as { title?: unknown } | undefined;
    return (
      typeof documentId === "number" &&
      collection === "schedule-items" &&
      typeof snapshot?.title === "string"
    );
  }

  if (parsed.strategy === "restore_deleted_checklist") {
    const snapshot = parsed.beforeSnapshot as { title?: unknown } | undefined;
    return (
      typeof documentId === "number" &&
      collection === "checklists" &&
      typeof snapshot?.title === "string"
    );
  }

  if (parsed.strategy === "restore_deleted_timeline_event") {
    const snapshot = parsed.beforeSnapshot as { title?: unknown } | undefined;
    return (
      typeof documentId === "number" &&
      collection === "timeline-events" &&
      typeof snapshot?.title === "string"
    );
  }

  if (parsed.strategy === "restore_modified_record") {
    return (
      typeof documentId === "number" &&
      ["checklists", "plans", "schedule-items", "timeline-events"].includes(collection) &&
      parsed.beforeSnapshot != null
    );
  }

  return false;
};
