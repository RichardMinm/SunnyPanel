import { isRecord } from "@/lib/shared/is-record";
export type AgentRollbackOperation = "delete" | "update";

export type AgentRollbackAffectedDocument = {
  collection: string;
  documentId: number;
  operation: AgentRollbackOperation;
  visibility?: "private" | "public" | "unknown";
};

export type AgentRollbackExecutionResult = {
  affectedDocuments?: AgentRollbackAffectedDocument[];
  auditWarning?: string;
  collection?: string;
  documentId?: number;
  strategy: string;
  summary?: string;
};

export type AgentRollbackDisplayRow = {
  detail: string;
  label: string;
  operationLabel: string;
};

const rollbackCollectionLabelMap: Record<string, string> = {
  "agent-memories": "记忆",
  checklists: "清单",
  notes: "笔记",
  pages: "页面",
  "plan-reviews": "复盘",
  plans: "计划",
  posts: "文章",
  "schedule-items": "日程",
  "timeline-events": "时间线",
  updates: "动态",
};

const rollbackOperationLabelMap: Record<AgentRollbackOperation, string> = {
  delete: "已删除",
  update: "已恢复",
};

const rollbackStrategyLabelMap: Record<string, string> = {
  archive_created_memory: "归档刚保存的记忆",
  delete_created_document: "删除刚创建的文档",
  delete_created_documents: "删除刚创建的一组文档",
  delete_created_timeline_event: "删除刚创建的时间线节点",
  delete_created_weekly_review_artifacts: "删除本周回顾的 PlanReview 与运行记录",
  restore_checklist_groups: "恢复清单快照",
  restore_checklist_groups_and_timeline: "恢复清单并移除关联时间线",
  restore_schedule_item_snapshot: "恢复日程快照",
  restore_schedule_item_status: "恢复日程状态",
};


const isRollbackOperation = (value: unknown): value is AgentRollbackOperation =>
  value === "delete" || value === "update";

const normalizeAffectedDocument = (value: unknown): AgentRollbackAffectedDocument | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.collection !== "string" || value.collection.length === 0) {
    return null;
  }

  if (typeof value.documentId !== "number" || !Number.isFinite(value.documentId)) {
    return null;
  }

  if (!isRollbackOperation(value.operation)) {
    return null;
  }

  return {
    collection: value.collection,
    documentId: value.documentId,
    operation: value.operation,
    ...(value.visibility === "private" || value.visibility === "public" || value.visibility === "unknown"
      ? { visibility: value.visibility }
      : {}),
  };
};

const inferFallbackOperation = (strategy: string): AgentRollbackOperation =>
  strategy.startsWith("delete") || strategy.includes("archive") ? "delete" : "update";

export const normalizeRollbackExecutionResult = (value: unknown): AgentRollbackExecutionResult | null => {
  if (!isRecord(value) || typeof value.strategy !== "string" || value.strategy.length === 0) {
    return null;
  }

  let affectedDocuments: AgentRollbackAffectedDocument[] | undefined;

  if ("affectedDocuments" in value) {
    if (!Array.isArray(value.affectedDocuments)) {
      return null;
    }

    affectedDocuments = [];

    for (const affectedDocument of value.affectedDocuments) {
      const normalized = normalizeAffectedDocument(affectedDocument);

      if (!normalized) {
        return null;
      }

      affectedDocuments.push(normalized);
    }
  }

  return {
    ...(affectedDocuments ? { affectedDocuments } : {}),
    ...(typeof value.auditWarning === "string" && value.auditWarning.length > 0
      ? { auditWarning: value.auditWarning }
      : {}),
    ...(typeof value.collection === "string" && value.collection.length > 0 ? { collection: value.collection } : {}),
    ...(typeof value.documentId === "number" && Number.isFinite(value.documentId)
      ? { documentId: value.documentId }
      : {}),
    strategy: value.strategy,
    ...(typeof value.summary === "string" && value.summary.length > 0 ? { summary: value.summary } : {}),
  };
};

export const buildRollbackResultDisplayRows = (
  result: AgentRollbackExecutionResult,
): AgentRollbackDisplayRow[] => {
  const affectedDocuments =
    result.affectedDocuments && result.affectedDocuments.length > 0
      ? result.affectedDocuments
      : result.collection && typeof result.documentId === "number"
        ? [
            {
              collection: result.collection,
              documentId: result.documentId,
              operation: inferFallbackOperation(result.strategy),
            },
          ]
        : [];

  return affectedDocuments.map((document) => ({
    detail: `${document.collection} #${document.documentId}`,
    label: rollbackCollectionLabelMap[document.collection] ?? document.collection,
    operationLabel: rollbackOperationLabelMap[document.operation],
  }));
};

export const formatRollbackResultStatus = (result: AgentRollbackExecutionResult) => {
  const affectedCount = buildRollbackResultDisplayRows(result).length;

  return affectedCount > 0 ? `已执行撤销，影响 ${affectedCount} 个对象` : "已执行撤销";
};

export const formatRollbackStrategyLabel = (strategy: string) =>
  rollbackStrategyLabelMap[strategy] ?? "撤销写入";
