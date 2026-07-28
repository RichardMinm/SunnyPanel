import { getPayloadClient } from "@/lib/payload/client";

import type {
  AgentDryRunClarifyResult,
  AgentDryRunProposedActionResult,
  DeleteRecordArgs,
} from "../schemas";
import {
  createAgentRun,
  createOwnedRollbackToolResult,
  normalizeForSearch,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

export type DeleteRecordCollection =
  | "checklists"
  | "plans"
  | "schedule-items"
  | "timeline-events";

export type DeleteRecordTarget = {
  collection: DeleteRecordCollection;
  document: Record<string, unknown> & { id: number; title: string };
  id: number;
  title: string;
};

export type ResolveDeleteRecord = (
  args: DeleteRecordArgs,
) => Promise<{
  question: null | string;
  resolved: DeleteRecordTarget | null;
}>;

type PayloadLike = {
  create: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  find: (args: unknown) => Promise<{ docs: unknown[] }>;
  findByID: (args: unknown) => Promise<null | unknown>;
};

type DeleteRecordDryRunContext = {
  createActionId?: () => string;
  planCandidates?: Array<{ id?: null | number; title: string } & Record<string, unknown>>;
  resolveDeleteRecord?: ResolveDeleteRecord;
};

const collectionByEntityType: Record<DeleteRecordArgs["entityType"], DeleteRecordCollection> = {
  checklist: "checklists",
  plan: "plans",
  schedule: "schedule-items",
  timeline: "timeline-events",
};

const entityLabel: Record<DeleteRecordArgs["entityType"], string> = {
  checklist: "清单",
  plan: "计划",
  schedule: "日程",
  timeline: "时间线",
};

const workflowByEntityType: Record<DeleteRecordArgs["entityType"], "planning" | "sync"> = {
  checklist: "sync",
  plan: "planning",
  schedule: "planning",
  timeline: "sync",
};

const rollbackStrategyByEntityType: Record<DeleteRecordArgs["entityType"], string> = {
  checklist: "restore_deleted_checklist",
  plan: "restore_deleted_plan",
  schedule: "restore_deleted_schedule_item",
  timeline: "restore_deleted_timeline_event",
};

const createActionId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `agent-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatTargetCandidates = (
  docs: Array<Record<string, unknown> & { id: number; title: string }>,
) => docs.slice(0, 5).map((doc) => `· ${doc.title} (ID: ${doc.id})`).join("\n");

const pickFields = (document: Record<string, unknown>, fields: string[]) => {
  const snapshot: Record<string, unknown> = {};

  for (const field of fields) {
    if (field in document && document[field] !== undefined) {
      snapshot[field] = document[field];
    }
  }

  return snapshot;
};

const snapshotByEntityType = (
  entityType: DeleteRecordArgs["entityType"],
  document: Record<string, unknown>,
) => {
  if (entityType === "plan") {
    return pickFields(document, [
      "agentBrief",
      "description",
      "domain",
      "dueDate",
      "executionMode",
      "phases",
      "priority",
      "progress",
      "startDate",
      "state",
      "status",
      "title",
      "totalEstimatedDays",
      "visibility",
      "weeklyRhythm",
    ]);
  }

  if (entityType === "schedule") {
    return pickFields(document, [
      "category",
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
    ]);
  }

  if (entityType === "checklist") {
    return pickFields(document, [
      "groups",
      "publishedAt",
      "slug",
      "status",
      "summary",
      "title",
      "visibility",
    ]);
  }

  return pickFields(document, [
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
  ]);
};

const buildRollbackPayload = (
  args: DeleteRecordArgs,
  collection: DeleteRecordCollection,
  documentId: number,
  beforeSnapshot: Record<string, unknown>,
) => ({
  beforeSnapshot,
  strategy: rollbackStrategyByEntityType[args.entityType],
  target: {
    collection,
    documentId,
  },
});

export const resolveDeleteRecordTarget = async (
  args: DeleteRecordArgs,
  options: { payload?: unknown } = {},
): ReturnType<ResolveDeleteRecord> => {
  const payload = (options.payload ?? (await getPayloadClient())) as Pick<PayloadLike, "find" | "findByID">;
  const collection = collectionByEntityType[args.entityType];

  if (args.targetId) {
    const document = await payload.findByID({
      collection,
      depth: 0,
      id: args.targetId,
      overrideAccess: true,
    });

    if (!document || typeof (document as { id?: unknown }).id !== "number" || typeof (document as { title?: unknown }).title !== "string") {
      return {
        question: `未找到 ID 为 ${args.targetId} 的${entityLabel[args.entityType]}。请确认目标 ID。`,
        resolved: null,
      };
    }

    const doc = document as Record<string, unknown> & { id: number; title: string };
    return {
      question: null,
      resolved: {
        collection,
        document: doc,
        id: doc.id,
        title: doc.title,
      },
    };
  }

  const entityName = args.entityName.trim();
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 6,
    overrideAccess: true,
    pagination: false,
    where: { title: { like: entityName } },
  });
  const docs = result.docs
    .map((doc) => doc as Record<string, unknown> & { id?: unknown; title?: unknown })
    .filter(
      (doc): doc is Record<string, unknown> & { id: number; title: string } =>
        typeof doc.id === "number" && typeof doc.title === "string",
    );
  const exact = docs.filter(
    (doc) => normalizeForSearch(doc.title) === normalizeForSearch(entityName),
  );
  const candidates = exact.length === 1 ? exact : docs;

  if (candidates.length === 0) {
    return {
      question: `未找到标题包含「${entityName}」的${entityLabel[args.entityType]}。请检查名称或提供 ID。`,
      resolved: null,
    };
  }

  if (candidates.length > 1) {
    return {
      question: `找到多个匹配的${entityLabel[args.entityType]}：\n${formatTargetCandidates(candidates)}\n\n请指定名称或 ID。`,
      resolved: null,
    };
  }

  const document = candidates[0]!;
  return {
    question: null,
    resolved: {
      collection,
      document,
      id: document.id,
      title: document.title,
    },
  };
};

const resolvePlanCandidateFromContext = (
  args: DeleteRecordArgs,
  planCandidates: DeleteRecordDryRunContext["planCandidates"],
): ReturnType<ResolveDeleteRecord> => {
  const entityName = args.entityName.trim();
  const candidates = planCandidates ?? [];
  const docs = candidates.filter(
    (candidate): candidate is { id: number; title: string } & Record<string, unknown> =>
      typeof candidate.id === "number" &&
      (candidate.title.includes(entityName) || entityName.includes(candidate.title)),
  );
  const exact = docs.filter(
    (doc) => normalizeForSearch(doc.title) === normalizeForSearch(entityName),
  );
  const matches = exact.length === 1 ? exact : docs;

  if (matches.length === 0) {
    return Promise.resolve({
      question: `未找到标题包含「${entityName}」的计划。请检查计划名称是否正确。`,
      resolved: null,
    });
  }

  if (matches.length > 1) {
    return Promise.resolve({
      question: `找到多个匹配的计划：\n${formatTargetCandidates(matches)}\n\n请指定要删除的具体计划名称。`,
      resolved: null,
    });
  }

  const document = matches[0]!;
  return Promise.resolve({
    question: null,
    resolved: {
      collection: "plans",
      document: document as Record<string, unknown> & { id: number; title: string },
      id: document.id,
      title: document.title,
    },
  });
};

export const deleteRecordDryRun = async (
  args: DeleteRecordArgs,
  context: DeleteRecordDryRunContext = {},
): Promise<AgentDryRunClarifyResult | AgentDryRunProposedActionResult> => {
  const trimmedName = args.entityName.trim();

  if (!trimmedName || trimmedName.length < 2) {
    const question = `请提供要删除的${entityLabel[args.entityType]}名称，例如「删除「React 学习计划」」。`;
    return {
      assistantMessage: question,
      pendingAction: {
        args,
        intent: "delete_record",
        missingFields: ["entityName"],
        originalMessage: args.entityName,
        question,
        type: "await_clarification",
      },
      type: "clarify",
    };
  }

  const resolver =
    context.resolveDeleteRecord ??
    (args.entityType === "plan"
      ? (candidateArgs: DeleteRecordArgs) =>
          resolvePlanCandidateFromContext(candidateArgs, context.planCandidates)
      : resolveDeleteRecordTarget);
  const resolution = await resolver(args);

  if (!resolution.resolved) {
    const question = resolution.question ?? "未能唯一定位要删除的目标。";
    return {
      assistantMessage: question,
      pendingAction: {
        args,
        intent: "delete_record",
        missingFields: ["targetId"],
        originalMessage: args.entityName,
        question,
        type: "await_clarification",
      },
      type: "clarify",
    };
  }

  const { collection, document, id, title } = resolution.resolved;
  const normalizedArgs = {
    ...args,
    targetId: id,
  } satisfies DeleteRecordArgs;
  const beforeSnapshot = snapshotByEntityType(args.entityType, document);

  return {
    action: {
      args: normalizedArgs,
      beforeSnapshot,
      changes: [
        {
          beforePreview:
            args.entityType === "schedule" && typeof document.status === "string"
              ? `当前状态：${document.status}`
              : undefined,
          collection,
          documentId: id,
          operation: "delete",
          preview: `删除${entityLabel[args.entityType]}「${title}」`,
          visibility:
            document.visibility === "public" || document.visibility === "private"
              ? document.visibility
              : "unknown",
        },
      ],
      id: context.createActionId?.() ?? createActionId(),
      intent: "delete_record",
      requiresConfirmation: true,
      riskLevel: "high",
      rollbackAvailable: true,
      rollbackPayload: buildRollbackPayload(args, collection, id, beforeSnapshot),
      summary: `删除${entityLabel[args.entityType]}「${title}」（此操作可通过快照回滚恢复）`,
      toolName: "delete_record",
    },
    type: "proposed_action",
  };
};

export const deleteRecordFromIntent = async (
  args: DeleteRecordArgs,
  onTrace?: AgentExecutionTraceReporter,
  options: {
    payload?: unknown;
  } = {},
): Promise<AgentToolResult> => {
  const entityName = args.entityName.trim();
  if (!entityName || entityName.length < 2) {
    return {
      assistantMessage: `请提供要删除的${entityLabel[args.entityType]}名称或 ID。`,
      pendingAction: null,
    };
  }

  const payload = (options.payload ?? (await getPayloadClient())) as PayloadLike;
  const resolution = await resolveDeleteRecordTarget(args, { payload });

  if (!resolution.resolved) {
    return {
      assistantMessage: resolution.question ?? `未找到要删除的${entityLabel[args.entityType]}。`,
      pendingAction: null,
    };
  }

  const { collection, document, id, title } = resolution.resolved;
  const beforeSnapshot = snapshotByEntityType(args.entityType, document);
  const rollbackPayload = buildRollbackPayload(args, collection, id, beforeSnapshot);

  onTrace?.({
    detail: `确认删除 ${collection} #${id}「${title}」`,
    id: "tool-delete-record-confirm",
    kind: "write",
    status: "running",
    title: `准备删除${entityLabel[args.entityType]}「${title}」`,
  });

  await payload.delete({
    collection,
    id,
    overrideAccess: true,
  });

  onTrace?.({
    detail: `已从数据库中删除 ${collection} #${id}`,
    id: "tool-delete-record-executed",
    kind: "write",
    status: "done",
    title: `已删除${entityLabel[args.entityType]}「${title}」`,
  });

  const agentRun = await createAgentRun({
    affectedDocuments: [
      {
        collection,
        documentId: id,
        operation: "delete",
        visibility:
          document.visibility === "public" || document.visibility === "private"
            ? document.visibility
            : "unknown",
      },
    ],
    afterSnapshot: null,
    beforeSnapshot,
    goal: `删除${entityLabel[args.entityType]}「${title}」`,
    nextAction: null,
    payload: payload as never,
    relatedPlan: args.entityType === "plan" ? id : undefined,
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [{ level: "info", message: `Agent 删除了${entityLabel[args.entityType]}「${title}」` }],
    summary: `Agent 已删除${entityLabel[args.entityType]}「${title}」`,
    title: `Agent deleted ${args.entityType} · ${title}`,
    workflow: workflowByEntityType[args.entityType],
  });

  return createOwnedRollbackToolResult({
    assistantMessage: `已删除${entityLabel[args.entityType]}「${title}」。`,
    pendingAction: null,
    rollbackPayload,
    rollbackSourceRunId: agentRun.id,
  });
};
