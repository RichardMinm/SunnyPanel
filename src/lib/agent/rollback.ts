import { getPayloadClient } from "@/lib/payload/client";

import { recordAgentRollbackExecuted } from "./audit";
import { parseRollbackPayload } from "./rollback-parse";

export type { RollbackPayload } from "./rollback-parse";
export { isRollbackPayloadExecutable, parseRollbackPayload } from "./rollback-parse";

export type RollbackExecutionResult = {
  auditWarning?: string;
  collection: string;
  documentId: number;
  strategy: string;
};

const persistRollbackAudit = async (
  rollbackPayload: unknown,
  result: Pick<RollbackExecutionResult, "collection" | "documentId" | "strategy">,
): Promise<string | undefined> => {
  try {
    await recordAgentRollbackExecuted({
      result,
      rollbackPayload,
    });
  } catch (error) {
    return error instanceof Error ? error.message : "审计记录写入失败";
  }

  return undefined;
};

/**
 * 按 AgentRun 中保存的 rollbackPayload 执行有限回滚（单用户 Payload 直连）。
 */
export const executeRollbackFromPayload = async (rollbackPayload: unknown): Promise<RollbackExecutionResult> => {
  const parsed = parseRollbackPayload(rollbackPayload);

  if (!parsed?.target?.collection) {
    throw new Error("rollbackPayload 缺少可执行的 target.collection。");
  }

  const payload = await getPayloadClient();
  const { collection, documentId } = parsed.target;

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

      const result = {
        collection,
        documentId,
        strategy: parsed.strategy,
      };
      const auditWarning = await persistRollbackAudit(rollbackPayload, result);

      return auditWarning ? { ...result, auditWarning } : result;
    }

    throw new Error(`delete_created_document 暂不支持 collection：${collection}`);
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

    const result = {
      collection,
      documentId,
      strategy: parsed.strategy,
    };
    const auditWarning = await persistRollbackAudit(rollbackPayload, result);

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

    const result = { collection, documentId, strategy: parsed.strategy };
    const auditWarning = await persistRollbackAudit(rollbackPayload, result);

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

    const result = { collection, documentId, strategy: parsed.strategy };
    const auditWarning = await persistRollbackAudit(rollbackPayload, result);

    return auditWarning ? { ...result, auditWarning } : result;
  }

  throw new Error(`暂不支持的回滚策略：${parsed.strategy}`);
};
