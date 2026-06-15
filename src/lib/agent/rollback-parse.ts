export type RollbackPayload = {
  beforeSnapshot?: unknown;
  reason?: string;
  strategy: string;
  target?: {
    agentRunId?: null | number;
    collection: string;
    documentId?: null | number;
    documentIds?: number[];
    planReviewId?: null | number;
    suggestionIds?: number[];
    timelineEventId?: null | number;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
        collection: typeof value.target.collection === "string" ? value.target.collection : "",
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

  return {
    beforeSnapshot: isRecord(value.beforeSnapshot) ? value.beforeSnapshot : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    strategy,
    target: target?.collection ? target : undefined,
  };
};

/** 与 `executeRollbackFromPayload` 支持的自动回滚范围对齐（纯函数，供 UI 判断是否展示按钮）。 */
export const isRollbackPayloadExecutable = (value: unknown): boolean => {
  const parsed = parseRollbackPayload(value);

  if (!parsed?.target?.collection) {
    return false;
  }

  const { collection, documentId, documentIds } = parsed.target;

  if (parsed.strategy === "delete_created_weekly_review_artifacts") {
    return typeof parsed.target.planReviewId === "number";
  }

  if (parsed.strategy === "delete_created_document") {
    return typeof documentId === "number" && (collection === "plans" || collection === "schedule-items");
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

  return false;
};
