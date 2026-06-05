export type AgentRunImpactOperation = "create" | "delete" | "update";

export type AgentRunSummaryAffectedDocument = {
  collection: string;
  documentId?: number;
  operation: AgentRunImpactOperation;
  visibility?: "private" | "public" | "unknown";
};

export type AgentRunSummaryView = {
  affectedDocuments?: AgentRunSummaryAffectedDocument[];
  id: number;
  impactSummary?: string;
  runKind: "rollback" | "review" | "write";
  startedAt?: null | string;
  status: string;
  summary?: null | string;
  title: string;
  workflow: string;
};

export type AgentRunDetailStep = {
  level: "error" | "info" | "warn";
  message: string;
  recordedAt?: null | string;
};

export type AgentRunDetailView = AgentRunSummaryView & {
  afterSnapshot?: unknown;
  beforeSnapshot?: unknown;
  completedAt?: null | string;
  durationMs?: number;
  goal?: null | string;
  nextAction?: null | string;
  rollbackAvailable?: boolean;
  rollbackPayload?: unknown;
  steps: AgentRunDetailStep[];
};

export type AgentRunRollbackResultSummary = {
  collection?: string;
  documentId?: number;
  strategy: string;
  summary?: string;
};

export type AgentRunRollbackConsumedPatch = {
  nextAction: string;
  rollbackAvailable: false;
  steps: AgentRunDetailStep[];
};

const collectionLabelMap: Record<string, string> = {
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

const operationLabelMap: Record<AgentRunImpactOperation, string> = {
  create: "已创建",
  delete: "已删除",
  update: "已恢复",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isImpactOperation = (value: unknown): value is AgentRunImpactOperation =>
  value === "create" || value === "delete" || value === "update";

const normalizeAffectedDocument = (value: unknown): AgentRunSummaryAffectedDocument | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.collection !== "string" || value.collection.length === 0 || !isImpactOperation(value.operation)) {
    return null;
  }

  return {
    collection: value.collection,
    ...(typeof value.documentId === "number" && Number.isFinite(value.documentId)
      ? { documentId: value.documentId }
      : {}),
    operation: value.operation,
    ...(value.visibility === "private" || value.visibility === "public" || value.visibility === "unknown"
      ? { visibility: value.visibility }
      : {}),
  };
};

const normalizeAffectedDocuments = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const affectedDocuments = value
    .map((document) => normalizeAffectedDocument(document))
    .filter((document): document is AgentRunSummaryAffectedDocument => Boolean(document));

  return affectedDocuments.length > 0 ? affectedDocuments : undefined;
};

const isStepLevel = (value: unknown): value is AgentRunDetailStep["level"] =>
  value === "error" || value === "info" || value === "warn";

const normalizeStep = (value: unknown): AgentRunDetailStep | null => {
  if (!isRecord(value) || typeof value.message !== "string" || value.message.length === 0) {
    return null;
  }

  return {
    level: isStepLevel(value.level) ? value.level : "info",
    message: value.message,
    ...(typeof value.recordedAt === "string" || value.recordedAt === null ? { recordedAt: value.recordedAt } : {}),
  };
};

const normalizeSteps = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((step) => normalizeStep(step)).filter((step): step is AgentRunDetailStep => Boolean(step));
};

const formatAffectedDocument = (document: AgentRunSummaryAffectedDocument) => {
  const collectionLabel = collectionLabelMap[document.collection] ?? document.collection;
  const documentLabel = typeof document.documentId === "number" ? ` #${document.documentId}` : "";

  return `${collectionLabel}${documentLabel} ${operationLabelMap[document.operation]}`;
};

const buildImpactSummary = (affectedDocuments?: AgentRunSummaryAffectedDocument[]) => {
  if (!affectedDocuments || affectedDocuments.length === 0) {
    return undefined;
  }

  return `影响 ${affectedDocuments.length} 个对象：${affectedDocuments.map(formatAffectedDocument).join("；")}`;
};

const isRollbackRun = (value: Record<string, unknown>) => {
  if (typeof value.title === "string" && value.title.startsWith("Agent rollback executed")) {
    return true;
  }

  if (isRecord(value.beforeSnapshot) && value.beforeSnapshot.note === "rollback_executed") {
    return true;
  }

  return false;
};

const getRunKind = (value: Record<string, unknown>): AgentRunSummaryView["runKind"] => {
  if (isRollbackRun(value)) {
    return "rollback";
  }

  return value.workflow === "weekly-review" ? "review" : "write";
};

export const toAgentRunSummary = (value: Record<string, unknown>): AgentRunSummaryView => {
  const affectedDocuments = normalizeAffectedDocuments(value.affectedDocuments);

  return {
    ...(affectedDocuments ? { affectedDocuments } : {}),
    id: typeof value.id === "number" ? value.id : 0,
    ...(affectedDocuments ? { impactSummary: buildImpactSummary(affectedDocuments) } : {}),
    runKind: getRunKind(value),
    ...(typeof value.startedAt === "string" || value.startedAt === null ? { startedAt: value.startedAt } : {}),
    status: typeof value.status === "string" ? value.status : "queued",
    ...(typeof value.summary === "string" || value.summary === null ? { summary: value.summary } : {}),
    title: typeof value.title === "string" && value.title.length > 0 ? value.title : "Agent Run",
    workflow: typeof value.workflow === "string" ? value.workflow : "readiness-audit",
  };
};

export const toAgentRunDetail = (value: Record<string, unknown>): AgentRunDetailView => {
  const summary = toAgentRunSummary(value);

  return {
    ...summary,
    ...("afterSnapshot" in value ? { afterSnapshot: value.afterSnapshot } : {}),
    ...("beforeSnapshot" in value ? { beforeSnapshot: value.beforeSnapshot } : {}),
    ...(typeof value.completedAt === "string" || value.completedAt === null ? { completedAt: value.completedAt } : {}),
    ...(typeof value.durationMs === "number" && Number.isFinite(value.durationMs) ? { durationMs: value.durationMs } : {}),
    ...(typeof value.goal === "string" || value.goal === null ? { goal: value.goal } : {}),
    ...(typeof value.nextAction === "string" || value.nextAction === null ? { nextAction: value.nextAction } : {}),
    ...(typeof value.rollbackAvailable === "boolean" ? { rollbackAvailable: value.rollbackAvailable } : {}),
    ...("rollbackPayload" in value ? { rollbackPayload: value.rollbackPayload } : {}),
    steps: normalizeSteps(value.steps),
  };
};

export const canRollbackAgentRunDetail = (run: AgentRunDetailView) =>
  run.rollbackAvailable === true && run.rollbackPayload !== null && run.rollbackPayload !== undefined;

export const formatAgentRunRollbackAction = (run: AgentRunDetailView) =>
  run.runKind === "rollback" ? "撤销这次回滚" : "撤销这次执行";

export const buildRollbackConsumedAgentRunPatch = (
  run: AgentRunDetailView,
  result: AgentRunRollbackResultSummary,
  recordedAt = new Date().toISOString(),
): AgentRunRollbackConsumedPatch => {
  const summary = result.summary ?? `已执行回滚 ${result.strategy}`;

  return {
    nextAction: `已执行撤销：${summary}`,
    rollbackAvailable: false,
    steps: [
      ...run.steps,
      {
        level: "warn",
        message: `ROLLBACK_CONSUMED sourceRun#${run.id} strategy=${result.strategy}`,
        recordedAt,
      },
    ],
  };
};
