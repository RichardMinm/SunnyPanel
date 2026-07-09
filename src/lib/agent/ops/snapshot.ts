import type { Where } from "payload";

import { getRelationId } from "@/lib/agent/run-access";
import { parsePendingAction } from "@/lib/agent/schemas";

export type AgentOpsSnapshot = {
  recentRuns: Array<{
    id: number | string;
    threadId?: number | string;
    intent?: string;
    status?: string;
    model?: null | string;
    totalTokens?: null | number;
    durationMs?: null | number;
    createdAt?: string;
  }>;
  recentReceipts: Array<{
    id: number | string;
    threadId?: number | string;
    actionId?: string;
    /** 操作的集合，如 checklists / plans / schedule-items */
    collection?: string | null;
    /** 操作的文档 ID */
    documentId?: number | string | null;
    operation?: "execute" | "rollback";
    status?: string;
    /** 操作文档的标题或简短摘要 */
    title?: string | null;
    createdAt?: string;
  }>;
  pendingActions: Array<{
    threadId: number | string;
    actionId?: string;
    /** 目标集合，如 checklists / plans / schedule-items */
    collection?: string | null;
    intent?: string;
    /** 待确认操作的简短预览 */
    preview?: string | null;
    createdAt?: string;
  }>;
  failures: Array<{
    source: "receipt" | "rollback" | "run";
    message: string;
    createdAt?: string;
  }>;
  summary: {
    runsCount: number;
    receiptsCount: number;
    pendingCount: number;
    failureCount: number;
  };
};

type AgentOpsCollection = "agent-action-receipts" | "agent-runs" | "agent-threads";

export type AgentOpsFindArgs = {
  collection: AgentOpsCollection;
  depth?: number;
  limit?: number;
  overrideAccess?: boolean;
  sort?: string;
  where?: Where;
};

export type AgentOpsPayloadClient = {
  find: (args: AgentOpsFindArgs) => Promise<{
    docs: Array<Record<string, unknown>>;
    totalDocs?: number;
  }>;
};

const clampLimit = (limit?: number) => {
  if (!Number.isFinite(limit)) {
    return 20;
  }

  return Math.min(Math.max(Math.floor(limit ?? 20), 1), 50);
};

const asRecord = (value: unknown): null | Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asId = (value: unknown): number | string | undefined =>
  typeof value === "number" || typeof value === "string" ? value : undefined;

const extractTotalTokens = (tokenUsage: unknown): null | number => {
  const usage = asRecord(tokenUsage);

  if (!usage) {
    return null;
  }

  const direct =
    asNumber(usage.totalTokens) ??
    asNumber(usage.total_tokens) ??
    asNumber(usage.total);

  if (direct !== undefined) {
    return direct;
  }

  const input = asNumber(usage.inputTokens) ?? asNumber(usage.promptTokens) ?? asNumber(usage.prompt_tokens);
  const output = asNumber(usage.outputTokens) ?? asNumber(usage.completionTokens) ?? asNumber(usage.completion_tokens);

  if (input !== undefined || output !== undefined) {
    return (input ?? 0) + (output ?? 0);
  }

  return null;
};

const formatFailureMessage = ({
  actionId,
  error,
  intent,
  operation,
  status,
  title,
}: {
  actionId?: string;
  error?: string;
  intent?: string;
  operation?: string;
  status?: string;
  title?: string;
}) => {
  const parts = [
    operation ? `${operation}` : null,
    intent,
    actionId,
  ].filter(Boolean);
  const prefix = parts.length > 0 ? parts.join(" · ") : title ?? "Agent action";
  const detail = error ?? status ?? "failed";
  const message = `${prefix}: ${detail}`;

  // Keep Ops Center summaries useful without turning them into raw traces.
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
};

const mapRun = (run: Record<string, unknown>): AgentOpsSnapshot["recentRuns"][number] => ({
  createdAt: asString(run.startedAt) ?? asString(run.createdAt),
  durationMs: asNumber(run.durationMs) ?? null,
  id: asId(run.id) ?? "unknown-run",
  intent: asString(run.workflow) ?? asString(run.agentRole),
  model: asString(run.model) ?? null,
  status: asString(run.status),
  totalTokens: extractTotalTokens(run.tokenUsage),
});

const mapReceipt = (receipt: Record<string, unknown>): AgentOpsSnapshot["recentReceipts"][number] => {
  const operation = asString(receipt.operation);
  const response = asRecord(receipt.response);
  const affectedDocs = Array.isArray(response?.affectedDocuments)
    ? (response!.affectedDocuments as Array<Record<string, unknown>>)
    : [];
  const firstDoc = affectedDocs[0];

  return {
    actionId: asString(receipt.actionId),
    collection: typeof firstDoc?.collection === "string" ? firstDoc.collection : null,
    createdAt: asString(receipt.createdAt) ?? asString(receipt.completedAt),
    documentId: asId(firstDoc?.documentId) ?? null,
    id: asId(receipt.id) ?? "unknown-receipt",
    operation: operation === "rollback" ? "rollback" : "execute",
    status: asString(receipt.status),
    threadId: getRelationId(receipt.thread) ?? undefined,
    title: typeof firstDoc?.title === "string" && firstDoc.title.trim().length > 0
      ? firstDoc.title.trim().slice(0, 80)
      : null,
  };
};

const mapPendingAction = (thread: Record<string, unknown>): null | AgentOpsSnapshot["pendingActions"][number] => {
  const pendingAction = parsePendingAction(thread.pendingAction);

  if (pendingAction?.type !== "await_confirmation") {
    return null;
  }

  const threadId = asId(thread.id);

  if (!threadId) {
    return null;
  }

  const action = pendingAction.action as Record<string, unknown> | undefined;
  const changes = Array.isArray(action?.changes) ? (action.changes as Array<Record<string, unknown>>) : [];
  const firstChange = changes[0];
  const collection =
    (typeof firstChange?.collection === "string" ? firstChange.collection : null) ??
    (typeof action?.collection === "string" ? (action as Record<string, string>).collection : null);
  const preview =
    (typeof firstChange?.preview === "string" && firstChange.preview.trim().length > 0
      ? firstChange.preview.trim().slice(0, 80)
      : null) ??
    (typeof action?.summary === "string" && (action as Record<string, string>).summary.trim().length > 0
      ? (action as Record<string, string>).summary.trim().slice(0, 80)
      : null);

  return {
    actionId: pendingAction.action.id,
    collection,
    createdAt: asString(thread.lastInteractionAt) ?? asString(thread.updatedAt) ?? asString(thread.createdAt),
    intent: pendingAction.action.intent,
    preview,
    threadId,
  };
};

export async function buildAgentOpsSnapshot({
  limit,
  payload,
  userId,
}: {
  limit?: number;
  payload: AgentOpsPayloadClient;
  userId: number;
}): Promise<AgentOpsSnapshot> {
  const safeLimit = clampLimit(limit);
  const ownedWhere: Where = { user: { equals: userId } };

  const [runsResult, receiptsResult, threadsResult] = await Promise.all([
    payload.find({
      collection: "agent-runs",
      depth: 0,
      limit: safeLimit,
      overrideAccess: true,
      sort: "-createdAt",
      where: ownedWhere,
    }),
    payload.find({
      collection: "agent-action-receipts",
      depth: 0,
      limit: safeLimit,
      overrideAccess: true,
      sort: "-createdAt",
      where: ownedWhere,
    }),
    payload.find({
      collection: "agent-threads",
      depth: 0,
      limit: safeLimit,
      overrideAccess: true,
      sort: "-lastInteractionAt",
      where: ownedWhere,
    }),
  ]);

  const recentRuns = runsResult.docs.slice(0, safeLimit).map(mapRun);
  const recentReceipts = receiptsResult.docs.slice(0, safeLimit).map(mapReceipt);
  const pendingActions = threadsResult.docs
    .map(mapPendingAction)
    .filter((item): item is AgentOpsSnapshot["pendingActions"][number] => item !== null)
    .slice(0, safeLimit);
  const runFailures = runsResult.docs
    .filter((run) => run.status === "failed" || run.status === "canceled")
    .slice(0, safeLimit)
    .map((run) => ({
      createdAt: asString(run.startedAt) ?? asString(run.createdAt),
      message: formatFailureMessage({
        status: asString(run.status),
        title: asString(run.title),
      }),
      source: "run" as const,
    }));
  const receiptFailures = receiptsResult.docs
    .filter((receipt) => receipt.status === "failed" || receipt.status === "indeterminate")
    .slice(0, safeLimit)
    .map((receipt) => {
      const operation = asString(receipt.operation);

      return {
        createdAt: asString(receipt.createdAt) ?? asString(receipt.completedAt),
        message: formatFailureMessage({
          actionId: asString(receipt.actionId),
          error: asString(receipt.error),
          intent: asString(receipt.intent),
          operation,
          status: asString(receipt.status),
        }),
        source: operation === "rollback" ? "rollback" as const : "receipt" as const,
      };
    });
  const failures = [...runFailures, ...receiptFailures].slice(0, safeLimit);

  return {
    failures,
    pendingActions,
    recentReceipts,
    recentRuns,
    summary: {
      failureCount: failures.length,
      pendingCount: pendingActions.length,
      receiptsCount: recentReceipts.length,
      runsCount: recentRuns.length,
    },
  };
}
