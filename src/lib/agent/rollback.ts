import { getPayloadClient } from "@/lib/payload/client";

import { recordAgentRollbackExecuted } from "./audit";
import { parseRollbackPayload } from "./rollback-parse";

export type { RollbackPayload } from "./rollback-parse";
export { isRollbackPayloadExecutable, parseRollbackPayload } from "./rollback-parse";

export type RollbackExecutionResult = {
  auditWarning?: string;
  affectedDocuments?: RollbackAffectedDocument[];
  collection: string;
  documentId: number;
  documentIds?: number[];
  strategy: string;
  summary?: string;
};

export type RollbackAffectedDocument = {
  collection: string;
  documentId: number;
  operation: "delete" | "update";
  visibility: "unknown";
};

type RollbackPayloadClient = {
  delete: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
};

type RollbackExecutionOptions = {
  payload?: RollbackPayloadClient;
  persistAudit?: boolean;
  recordAudit?: RollbackAuditRecorder;
  userId?: number;
};

const scheduleStatusValues = new Set(["canceled", "done", "planned", "skipped"]);

type RollbackAuditRecorder = (args: {
  result: RollbackExecutionResult;
  rollbackPayload: unknown;
  userId?: number;
}) => Promise<void>;

const affectedDocument = (
  collection: string,
  documentId: number,
  operation: RollbackAffectedDocument["operation"],
): RollbackAffectedDocument => ({
  collection,
  documentId,
  operation,
  visibility: "unknown",
});

const summarizeAffectedDocuments = (strategy: string, affectedDocuments: RollbackAffectedDocument[]) =>
  `已执行回滚 ${strategy}，影响 ${affectedDocuments.length} 个对象：${affectedDocuments
    .map((document) => `${document.collection}#${document.documentId} ${document.operation}`)
    .join("；")}`;

const buildRollbackResult = ({
  affectedDocuments,
  collection,
  documentId,
  documentIds,
  strategy,
}: {
  affectedDocuments: RollbackAffectedDocument[];
  collection: string;
  documentId: number;
  documentIds?: number[];
  strategy: string;
}): RollbackExecutionResult => ({
  affectedDocuments,
  collection,
  documentId,
  ...(documentIds ? { documentIds } : {}),
  strategy,
  summary: summarizeAffectedDocuments(strategy, affectedDocuments),
});

const persistRollbackAudit = async (
  rollbackPayload: unknown,
  result: RollbackExecutionResult,
  recordAudit: RollbackAuditRecorder = recordAgentRollbackExecuted,
  userId?: number,
): Promise<string | undefined> => {
  try {
    await recordAudit({
      result,
      rollbackPayload,
      userId,
    });
  } catch (error) {
    return error instanceof Error ? error.message : "审计记录写入失败";
  }

  return undefined;
};

const pickScheduleSnapshotData = (snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fields = [
    "agentBrief",
    "conflictNote",
    "date",
    "description",
    "endTime",
    "isAllDay",
    "priority",
    "relatedChecklist",
    "relatedChecklistItemKey",
    "relatedPlan",
    "sourceType",
    "startTime",
    "status",
    "title",
  ];

  for (const field of fields) {
    if (field in record) {
      data[field] = record[field];
    }
  }

  return Object.keys(data).length > 0 ? data : null;
};

const pickTimelineSnapshotData = (snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fields = [
    "description",
    "eventDate",
    "isFeatured",
    "relatedArticle",
    "relatedChecklist",
    "relatedNow",
    "relatedPlan",
    "relatedTaskKey",
    "sortOrder",
    "status",
    "title",
    "type",
    "visibility",
  ];

  for (const field of fields) {
    if (field in record) {
      data[field] = record[field];
    }
  }

  return Object.keys(data).length > 0 ? data : null;
};

/**
 * 按 AgentRun 中保存的 rollbackPayload 执行有限回滚（单用户 Payload 直连）。
 */
export const executeRollbackFromPayload = async (
  rollbackPayload: unknown,
  options: RollbackExecutionOptions = {},
): Promise<RollbackExecutionResult> => {
  const parsed = parseRollbackPayload(rollbackPayload);

  if (!parsed?.target?.collection) {
    throw new Error("rollbackPayload 缺少可执行的 target.collection。");
  }

  const payload = options.payload ?? (await getPayloadClient());
  const shouldPersistAudit = options.persistAudit !== false;
  const recordAudit = options.recordAudit ?? recordAgentRollbackExecuted;
  const userId = options.userId;
  const { collection, documentId, documentIds, timelineEventId } = parsed.target;

  if (parsed.strategy === "delete_created_document") {
    if (!documentId) {
      throw new Error("delete_created_document 需要 documentId；创建前回滚占位无法自动执行。");
    }

    if (collection === "plans" || collection === "schedule-items") {
      await payload.delete({
        collection,
        id: documentId,
        overrideAccess: true,
      });

      const result = buildRollbackResult({
        affectedDocuments: [affectedDocument(collection, documentId, "delete")],
        collection,
        documentId,
        strategy: parsed.strategy,
      });
      const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

      return auditWarning ? { ...result, auditWarning } : result;
    }

    throw new Error(`delete_created_document 暂不支持 collection：${collection}`);
  }

  if (parsed.strategy === "delete_created_documents") {
    const ids = documentIds ?? [];

    if (ids.length === 0) {
      throw new Error("delete_created_documents 需要至少一个 documentIds。");
    }

    if (collection === "plans" || collection === "schedule-items") {
      for (const id of ids) {
        await payload.delete({
          collection,
          id,
          overrideAccess: true,
        });
      }

      const result = buildRollbackResult({
        affectedDocuments: ids.map((id) => affectedDocument(collection, id, "delete")),
        collection,
        documentId: ids[0]!,
        documentIds: ids,
        strategy: parsed.strategy,
      });
      const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

      return auditWarning ? { ...result, auditWarning } : result;
    }

    throw new Error(`delete_created_documents 暂不支持 collection：${collection}`);
  }

  if (parsed.strategy === "delete_created_timeline_event") {
    if (!documentId) {
      throw new Error("delete_created_timeline_event 需要 documentId。");
    }

    if (collection !== "timeline-events") {
      throw new Error(`delete_created_timeline_event 期望 timeline-events，收到：${collection}`);
    }

    await payload.delete({
      collection: "timeline-events",
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "delete")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "archive_created_memory") {
    if (!documentId) {
      throw new Error("archive_created_memory 需要 documentId。");
    }

    if (collection !== "agent-memories") {
      throw new Error(`archive_created_memory 期望 agent-memories，收到：${collection}`);
    }

    await payload.update({
      collection: "agent-memories",
      data: { status: "archived" },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_checklist_groups") {
    if (!documentId) {
      throw new Error("restore_checklist_groups 需要 documentId。");
    }

    if (collection !== "checklists") {
      throw new Error(`restore_checklist_groups 期望 checklists，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot;

    if (!snapshot || !Array.isArray((snapshot as Record<string, unknown>).groups)) {
      throw new Error("restore_checklist_groups 缺少有效的 beforeSnapshot.groups。");
    }

    await payload.update({
      collection: "checklists",
      data: { groups: (snapshot as Record<string, unknown>).groups as never },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_checklist_groups_and_timeline") {
    if (!documentId) {
      throw new Error("restore_checklist_groups_and_timeline 需要 documentId。");
    }

    if (collection !== "checklists") {
      throw new Error(`restore_checklist_groups_and_timeline 期望 checklists，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot as { groups?: unknown; timelineEvent?: unknown } | undefined;

    if (!snapshot || !Array.isArray(snapshot.groups)) {
      throw new Error("restore_checklist_groups_and_timeline 缺少有效的 beforeSnapshot.groups。");
    }

    await payload.update({
      collection: "checklists",
      data: { groups: snapshot.groups as never },
      id: documentId,
      overrideAccess: true,
    });

    const timelineData = pickTimelineSnapshotData(snapshot.timelineEvent);

    const affectedDocuments = [affectedDocument(collection, documentId, "update")];

    if (timelineData && typeof (snapshot.timelineEvent as { id?: unknown }).id === "number") {
      await payload.update({
        collection: "timeline-events",
        data: timelineData as never,
        id: (snapshot.timelineEvent as { id: number }).id,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("timeline-events", (snapshot.timelineEvent as { id: number }).id, "update"));
    } else if (typeof timelineEventId === "number") {
      await payload.delete({
        collection: "timeline-events",
        id: timelineEventId,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("timeline-events", timelineEventId, "delete"));
    }

    const result = buildRollbackResult({
      affectedDocuments,
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_schedule_item_snapshot") {
    if (!documentId) {
      throw new Error("restore_schedule_item_snapshot 需要 documentId。");
    }

    if (collection !== "schedule-items") {
      throw new Error(`restore_schedule_item_snapshot 期望 schedule-items，收到：${collection}`);
    }

    const data = pickScheduleSnapshotData(parsed.beforeSnapshot);

    if (!data) {
      throw new Error("restore_schedule_item_snapshot 缺少有效的 beforeSnapshot。");
    }

    await payload.update({
      collection: "schedule-items",
      data: data as never,
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_schedule_item_status") {
    if (!documentId) {
      throw new Error("restore_schedule_item_status 需要 documentId。");
    }

    if (collection !== "schedule-items") {
      throw new Error(`restore_schedule_item_status 期望 schedule-items，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot as { status?: unknown } | undefined;

    if (!snapshot || typeof snapshot.status !== "string" || !scheduleStatusValues.has(snapshot.status)) {
      throw new Error("restore_schedule_item_status 缺少有效的 beforeSnapshot.status。");
    }
    const status = snapshot.status as "canceled" | "done" | "planned" | "skipped";

    await payload.update({
      collection: "schedule-items",
      data: { status },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  throw new Error(`暂不支持的回滚策略：${parsed.strategy}`);
};
