export type RollbackPayload = {
  beforeSnapshot?: unknown;
  reason?: string;
  strategy: string;
  target?: {
    agentRunId?: null | number;
    collection: string;
    documentId?: null | number;
    planReviewId?: null | number;
    suggestionIds?: number[];
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
        planReviewId:
          typeof value.target.planReviewId === "number" ? value.target.planReviewId : undefined,
        suggestionIds: Array.isArray(value.target.suggestionIds)
          ? value.target.suggestionIds.filter((id): id is number => typeof id === "number")
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

  const { collection, documentId } = parsed.target;

  if (typeof documentId !== "number") {
    return false;
  }

  if (parsed.strategy === "delete_created_document") {
    return collection === "plans" || collection === "schedule-items";
  }

  if (parsed.strategy === "delete_created_timeline_event") {
    return collection === "timeline-events";
  }

  if (parsed.strategy === "archive_created_memory") {
    return collection === "agent-memories";
  }

  if (parsed.strategy === "restore_checklist_groups") {
    return collection === "checklists" && parsed.beforeSnapshot != null;
  }

  return false;
};
