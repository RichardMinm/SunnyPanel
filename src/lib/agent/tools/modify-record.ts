import { getPayloadClient } from "@/lib/payload/client";
import {
  completeScheduleItem,
  createTransactionalScheduleCompletionPayload,
} from "@/lib/schedule/complete-schedule-item";
import { getCurrentAgentUserId } from "../execution-context";
import { markServerInternalFailedAuditCompensation } from "../internal-rollback-evidence";
import { isRecord } from "@/lib/shared/is-record";
import { isRollbackPayloadExecutable } from "../rollback-parse";

import {
  parseAgentIntentResult,
  type AgentDryRunClarifyResult,
  type AgentDryRunProposedActionResult,
  type ChecklistRecordPatch,
  type ModifyRecordArgs,
  type PlanRecordPatch,
  type ScheduleRecordPatch,
  type TimelineRecordPatch,
} from "../schemas";
import {
  createAgentRun,
  createOwnedRollbackToolResult,
  sanitizeAffectedDocuments,
  type AffectedDocumentSummary,
  normalizeForSearch,
  type AgentExecutionTraceReporter,
  type AgentToolResult,
} from "../tool-shared";

export type ModifyRecordCollection =
  | "checklists"
  | "plans"
  | "schedule-items"
  | "timeline-events";

export type ModifyRecordTarget = {
  collection: ModifyRecordCollection;
  document: Record<string, unknown> & { id: number; title: string };
  id: number;
  title: string;
};

export type ResolveModifyRecord = (
  args: ModifyRecordArgs,
) => Promise<{
  question: null | string;
  resolved: ModifyRecordTarget | null;
}>;

type ModifyRecordDryRunContext = {
  createActionId?: () => string;
  resolveModifyRecord?: ResolveModifyRecord;
};

type ModifyRecordPatch =
  | ChecklistRecordPatch
  | PlanRecordPatch
  | ScheduleRecordPatch
  | TimelineRecordPatch;

const collectionByEntityType: Record<ModifyRecordArgs["entityType"], ModifyRecordCollection> = {
  checklist: "checklists",
  plan: "plans",
  schedule: "schedule-items",
  timeline: "timeline-events",
};

const entityLabel: Record<ModifyRecordArgs["entityType"], string> = {
  checklist: "清单",
  plan: "计划",
  schedule: "日程",
  timeline: "时间线",
};

const allowedFields: Record<ModifyRecordArgs["entityType"], ReadonlySet<string>> = {
  checklist: new Set(["publishedAt", "status", "summary", "title", "visibility"]),
  plan: new Set([
    "description",
    "domain",
    "dueDate",
    "executionMode",
    "priority",
    "startDate",
    "state",
    "status",
    "title",
    "visibility",
  ]),
  schedule: new Set([
    "category",
    "date",
    "description",
    "endTime",
    "isAllDay",
    "priority",
    "startTime",
    "status",
    "title",
  ]),
  timeline: new Set([
    "description",
    "eventDate",
    "isFeatured",
    "sortOrder",
    "status",
    "title",
    "type",
    "visibility",
  ]),
};

const forbiddenDescriptionPattern =
  /(分组|嵌套|清单条目|第一项|第.+项|groups?|items?|linkedContent|related(?:Plan|Checklist|Post|Update)|lastAgentRun|agentContext|subtasks|prerequisites|slug|createdAt|updatedAt|内部元数据)/i;

const createActionId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `agent-action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const captureMatch = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim();

const parsePriority = (text: string) => {
  if (!/优先级|priority/i.test(text)) return undefined;
  if (/高|high/i.test(text)) return "high" as const;
  if (/低|low/i.test(text)) return "low" as const;
  if (/中|medium/i.test(text)) return "medium" as const;
  return undefined;
};

const parseContentStatus = (text: string) => {
  if (/发布|published/i.test(text)) return "published" as const;
  if (/草稿|draft/i.test(text)) return "draft" as const;
  return undefined;
};

const parseVisibility = (text: string) => {
  if (/公开|public/i.test(text)) return "public" as const;
  if (/私有|私密|private/i.test(text)) return "private" as const;
  return undefined;
};

const parseNullableText = (text: string, labels: string) => {
  if (new RegExp(`(?:清空|删除)(?:${labels})`).test(text)) return null;
  return captureMatch(
    text,
    new RegExp(`(?:${labels})(?:改为|改成|更新为|设为|设置为)\\s*[「“"]?([^，。；;」”"]+)[」”"]?`),
  );
};

const parseCommonPatch = (text: string) => {
  const title = parseNullableText(text, "标题|名称");
  const description = parseNullableText(text, "说明|描述");

  return {
    ...(typeof title === "string" && title ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
  };
};

const parsePlanPatch = (text: string): PlanRecordPatch => {
  const common = parseCommonPatch(text);
  const date = captureMatch(text, /(\d{4}-\d{2}-\d{2})/);
  const priority = parsePriority(text);
  const status = parseContentStatus(text);
  const visibility = parseVisibility(text);
  const state = /已完成|完成状态|done/i.test(text)
    ? "done"
    : /暂停|paused/i.test(text)
      ? "paused"
      : /进行中|active/i.test(text)
        ? "active"
        : /待开始|backlog/i.test(text)
          ? "backlog"
          : undefined;
  const executionMode = /以 Agent 为主|agent 模式|executionMode.?agent/i.test(text)
    ? "agent"
    : /人工\s*\+\s*Agent|混合|hybrid/i.test(text)
      ? "hybrid"
      : /人工模式|manual/i.test(text)
        ? "manual"
        : undefined;
  const domain = /学习|study/i.test(text)
    ? "study"
    : /工作|work/i.test(text)
      ? "work"
      : /旅行|travel/i.test(text)
        ? "travel"
        : /健身|fitness/i.test(text)
          ? "fitness"
          : /创作|creative/i.test(text)
            ? "creative"
            : undefined;

  return {
    ...common,
    ...(date && /截止|到期|due/i.test(text) ? { dueDate: date } : {}),
    ...(date && /开始|start/i.test(text) ? { startDate: date } : {}),
    ...(domain ? { domain } : {}),
    ...(executionMode ? { executionMode } : {}),
    ...(priority ? { priority } : {}),
    ...(state ? { state } : {}),
    ...(status ? { status } : {}),
    ...(visibility ? { visibility } : {}),
  };
};

const parseSchedulePatch = (text: string): ScheduleRecordPatch => {
  const common = parseCommonPatch(text);
  const date = captureMatch(text, /(\d{4}-\d{2}-\d{2})/);
  const startTime = captureMatch(text, /(?:开始时间|从|改为|改到)\s*(\d{1,2}:\d{2})/);
  const endTime = captureMatch(text, /(?:结束时间|到)\s*(\d{1,2}:\d{2})/);
  const priority = parsePriority(text);
  const description = parseNullableText(text, "说明|描述");
  const status = /取消|canceled/i.test(text)
    ? "canceled"
    : /跳过|skipped/i.test(text)
      ? "skipped"
      : /完成|done/i.test(text)
        ? "done"
        : /计划中|planned/i.test(text)
          ? "planned"
          : undefined;
  const category = /课程|course/i.test(text)
    ? "course"
    : /学习|study/i.test(text)
      ? "study"
      : /计划动作|plan_action/i.test(text)
        ? "plan_action"
        : /考试|exam/i.test(text)
          ? "exam"
          : /Agent/i.test(text)
            ? "agent"
            : undefined;

  return {
    ...common,
    ...(category ? { category } : {}),
    ...(date ? { date } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(endTime ? { endTime } : {}),
    ...(/全天/.test(text) ? { isAllDay: !/取消全天|非全天/.test(text) } : {}),
    ...(priority ? { priority } : {}),
    ...(startTime ? { startTime } : {}),
    ...(status ? { status } : {}),
  };
};

const parseChecklistPatch = (text: string): ChecklistRecordPatch => {
  const title = parseNullableText(text, "标题|名称");
  const summary = parseNullableText(text, "说明|摘要|简介");
  const publishedAt = captureMatch(text, /(\d{4}-\d{2}-\d{2})/);
  const status = parseContentStatus(text);
  const visibility = parseVisibility(text);

  return {
    ...(publishedAt && /发布(?:时间|日期)|publishedAt/i.test(text) ? { publishedAt } : {}),
    ...(status ? { status } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(typeof title === "string" && title ? { title } : {}),
    ...(visibility ? { visibility } : {}),
  };
};

const parseTimelinePatch = (text: string): TimelineRecordPatch => {
  const common = parseCommonPatch(text);
  const eventDate = captureMatch(text, /(\d{4}-\d{2}-\d{2})/);
  const status = parseContentStatus(text);
  const visibility = parseVisibility(text);
  const sortOrder = Number(captureMatch(text, /(?:排序|权重|sortOrder)(?:改为|改成|设为|设置为)?\s*(-?\d+)/));
  const type = /项目|project/i.test(text)
    ? "project"
    : /里程碑|milestone/i.test(text)
      ? "milestone"
      : /生活|life/i.test(text)
        ? "life"
        : /学习|study/i.test(text)
          ? "study"
          : /考试|exam/i.test(text)
            ? "exam"
            : /Agent/i.test(text)
              ? "agent"
              : undefined;

  return {
    ...common,
    ...(eventDate ? { eventDate } : {}),
    ...(/精选|featured/i.test(text) ? { isFeatured: !/取消精选|非精选|not featured/i.test(text) } : {}),
    ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(visibility ? { visibility } : {}),
  };
};

const parsePatchFromDescription = (args: ModifyRecordArgs): ModifyRecordPatch => {
  switch (args.entityType) {
    case "plan":
      return parsePlanPatch(args.changeDescription);
    case "schedule":
      return parseSchedulePatch(args.changeDescription);
    case "checklist":
      return parseChecklistPatch(args.changeDescription);
    case "timeline":
      return parseTimelinePatch(args.changeDescription);
  }
};

export const normalizeModifyRecordPatch = (
  args: ModifyRecordArgs,
): { error: null | string; patch: ModifyRecordPatch | null } => {
  const rawPatch = isRecord(args.patch) ? args.patch : null;
  const unsupportedFields = rawPatch
    ? Object.keys(rawPatch).filter((field) => !allowedFields[args.entityType].has(field))
    : [];

  if (unsupportedFields.length > 0 || forbiddenDescriptionPattern.test(args.changeDescription)) {
    return {
      error:
        "当前只支持修改实体的安全标量字段，不支持修改关系字段、内部 Agent 元数据或清单嵌套条目。",
      patch: null,
    };
  }

  const parsedIntent = rawPatch
    ? parseAgentIntentResult({
        args: {
          ...args,
          patch: rawPatch,
        },
        confidence: 1,
        intent: "modify_record",
      })
    : null;
  const patch = rawPatch
    ? parsedIntent?.intent === "modify_record"
      ? parsedIntent.args.patch ?? {}
      : {}
    : parsePatchFromDescription(args);

  if (Object.keys(patch).length === 0) {
    return {
      error:
        `我还不能从「${args.changeDescription}」中确定要修改的安全字段。请明确说明标题、说明、日期、状态、优先级或可见性等字段和值。`,
      patch: null,
    };
  }

  return { error: null, patch: patch as ModifyRecordPatch };
};

const formatTargetCandidates = (
  docs: Array<Record<string, unknown> & { id: number; title: string }>,
) => docs.slice(0, 5).map((doc) => `· ${doc.title} (ID: ${doc.id})`).join("\n");

export const resolveModifyRecordTarget = async (
  args: ModifyRecordArgs,
): ReturnType<ResolveModifyRecord> => {
  const payload = await getPayloadClient();
  const collection = collectionByEntityType[args.entityType];

  if (args.targetId) {
    const document = await payload.findByID({
      collection,
      depth: 0,
      id: args.targetId,
      overrideAccess: true,
    });

    if (!document || typeof document.id !== "number" || typeof document.title !== "string") {
      return {
        question: `未找到 ID 为 ${args.targetId} 的${entityLabel[args.entityType]}。请确认目标 ID。`,
        resolved: null,
      };
    }

    return {
      question: null,
      resolved: {
        collection,
        document: document as unknown as ModifyRecordTarget["document"],
        id: document.id,
        title: document.title,
      },
    };
  }

  const result = await payload.find({
    collection,
    depth: 0,
    limit: 6,
    overrideAccess: true,
    pagination: false,
    where: { title: { like: args.entityName.trim() } },
  });
  const docs = result.docs
    .map((doc) => doc as unknown as ModifyRecordTarget["document"])
    .filter((doc) => typeof doc.id === "number" && typeof doc.title === "string");
  const exact = docs.filter(
    (doc) => normalizeForSearch(doc.title) === normalizeForSearch(args.entityName),
  );
  const candidates = exact.length === 1 ? exact : docs;

  if (candidates.length === 0) {
    return {
      question: `未找到标题包含「${args.entityName}」的${entityLabel[args.entityType]}。请检查名称或提供 ID。`,
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

const beforeSnapshotForPatch = (
  document: Record<string, unknown>,
  patch: ModifyRecordPatch,
) => Object.fromEntries(Object.keys(patch).map((field) => [field, document[field] ?? null]));

const previewValue = (value: unknown) =>
  value === null ? "清空" : typeof value === "string" ? value : JSON.stringify(value);

export const modifyRecordDryRun = async (
  args: ModifyRecordArgs,
  context: ModifyRecordDryRunContext = {},
): Promise<AgentDryRunClarifyResult | AgentDryRunProposedActionResult> => {
  const normalized = normalizeModifyRecordPatch(args);

  if (!normalized.patch || normalized.error) {
    const question = normalized.error ?? "请明确要修改的字段和值。";
    return {
      assistantMessage: question,
      pendingAction: {
        args,
        intent: "modify_record",
        missingFields: ["patch"],
        originalMessage: args.changeDescription,
        question,
        type: "await_clarification",
      },
      type: "clarify",
    };
  }

  const resolution = await (context.resolveModifyRecord ?? resolveModifyRecordTarget)(args);
  if (!resolution.resolved) {
    const question = resolution.question ?? "未能唯一定位要修改的目标。";
    return {
      assistantMessage: question,
      pendingAction: {
        args,
        intent: "modify_record",
        missingFields: ["targetId"],
        originalMessage: args.changeDescription,
        question,
        type: "await_clarification",
      },
      type: "clarify",
    };
  }

  const { collection, document, id, title } = resolution.resolved;
  const beforeSnapshot = beforeSnapshotForPatch(document, normalized.patch);
  const normalizedArgs = {
    ...args,
    patch: normalized.patch,
    targetId: id,
  } as ModifyRecordArgs;
  const changedFields = Object.entries(normalized.patch)
    .map(([field, value]) => `${field}=${previewValue(value)}`)
    .join("，");

  return {
    action: {
      afterSnapshot: normalized.patch,
      args: normalizedArgs,
      beforeSnapshot,
      changes: [
        {
          afterPreview: changedFields,
          beforePreview: Object.entries(beforeSnapshot)
            .map(([field, value]) => `${field}=${previewValue(value)}`)
            .join("，"),
          collection,
          documentId: id,
          operation: "update",
          preview: `更新${entityLabel[args.entityType]}「${title}」：${changedFields}`,
          visibility:
            document.visibility === "public" || document.visibility === "private"
              ? document.visibility
              : "unknown",
        },
      ],
      id: context.createActionId?.() ?? createActionId(),
      intent: "modify_record",
      requiresConfirmation: true,
      riskLevel:
        "visibility" in normalized.patch && normalized.patch.visibility === "public"
          ? "high"
          : "medium",
      rollbackAvailable: true,
      rollbackPayload: {
        beforeSnapshot,
        strategy: "restore_modified_record",
        target: {
          collection,
          documentId: id,
        },
      },
      summary: `修改${entityLabel[args.entityType]}「${title}」的安全标量字段`,
      toolName: "modify_record",
    },
    type: "proposed_action",
  };
};

export const modifyRecordFromIntent = async (
  args: ModifyRecordArgs,
  onTrace?: AgentExecutionTraceReporter,
  options: {
    completeSchedule?: (input: {
      additionalPatch: Omit<ScheduleRecordPatch, "status">;
      itemId: number;
    }) => Promise<{
      affectedDocuments: AffectedDocumentSummary[];
      ok: boolean;
      rollbackPayload?: unknown;
    }>;
    payload?: Awaited<ReturnType<typeof getPayloadClient>>;
  } = {},
): Promise<AgentToolResult> => {
  if (!args.targetId) {
    return {
      assistantMessage: "缺少已确认的目标 ID，请重新发起修改并确认预览。",
      pendingAction: null,
    };
  }

  const normalized = normalizeModifyRecordPatch(args);
  if (!normalized.patch || normalized.error) {
    return {
      assistantMessage: normalized.error ?? "缺少可执行的安全字段修改。",
      pendingAction: null,
    };
  }

  const payload = options.payload ?? (await getPayloadClient());
  const collection = collectionByEntityType[args.entityType];
  const document = await payload.findByID({
    collection,
    depth: 0,
    id: args.targetId,
    overrideAccess: true,
  });

  if (!document || typeof document.id !== "number" || typeof document.title !== "string") {
    return {
      assistantMessage: `未找到 ID 为 ${args.targetId} 的${entityLabel[args.entityType]}，未执行修改。`,
      pendingAction: null,
    };
  }

  const documentRecord = document as unknown as Record<string, unknown>;

  if (args.entityType === "schedule" && normalized.patch.status === "done") {
    const { status: _status, ...additionalPatch } = normalized.patch;
    const completion = options.completeSchedule
      ? await options.completeSchedule({ additionalPatch, itemId: args.targetId })
      : !getCurrentAgentUserId()
        ? { affectedDocuments: [] as AffectedDocumentSummary[], ok: false }
        : await completeScheduleItem({
          actor: { isAdministrator: true, userId: getCurrentAgentUserId()! },
          additionalPatch,
          itemId: args.targetId,
          payload: createTransactionalScheduleCompletionPayload({ payload: payload as never }),
        });

    if (!completion.ok) {
      return {
        assistantMessage: "日程完成操作未能安全执行，请稍后重试。",
        pendingAction: null,
        status: "failed",
      };
    }

    const affectedDocuments =
      sanitizeAffectedDocuments(completion.affectedDocuments) ?? [];
    const rollbackPayload = completion.rollbackPayload;
    const rollbackAvailable = isRollbackPayloadExecutable(rollbackPayload);
    const rollbackRecord = isRecord(rollbackPayload) ? rollbackPayload : null;
    let agentRun: Awaited<ReturnType<typeof createAgentRun>>;

    try {
      agentRun = await createAgentRun({
        affectedDocuments,
        afterSnapshot: rollbackRecord?.afterSnapshot ?? {
          scheduleId: args.targetId,
          status: "done",
        },
        beforeSnapshot: rollbackRecord?.beforeSnapshot ?? {
          scheduleId: args.targetId,
          status: documentRecord.status ?? null,
        },
        goal: `完成日程「${document.title}」`,
        nextAction: null,
        payload,
        rollbackAvailable,
        ...(rollbackPayload !== undefined ? { rollbackPayload } : {}),
        status: "succeeded",
        steps: [
          {
            level: "info",
            message: `已完成日程：${document.title}`,
          },
        ],
        summary: `Agent 已完成日程「${document.title}」。`,
        title: `Agent completed schedule item · ${document.title}`,
        workflow: "sync",
      });
    } catch {
      return markServerInternalFailedAuditCompensation({
        affectedDocuments,
        assistantMessage: `日程「${document.title}」已完成，但执行记录写入失败，未提供可撤销入口。`,
        pendingAction: null,
        ...(rollbackAvailable ? { rollbackPayload } : {}),
        status: "failed",
      });
    }

    if (rollbackAvailable) {
      return createOwnedRollbackToolResult({
        affectedDocuments,
        assistantMessage: `已完成日程「${document.title}」。`,
        pendingAction: null,
        rollbackPayload,
        rollbackSourceRunId: agentRun.id,
        status: "completed",
      });
    }

    return {
      affectedDocuments,
      assistantMessage: `已完成日程「${document.title}」。`,
      pendingAction: null,
      status: "completed",
    };
  }

  const beforeSnapshot = beforeSnapshotForPatch(documentRecord, normalized.patch);
  const rollbackPayload = {
    beforeSnapshot,
    strategy: "restore_modified_record",
    target: {
      collection,
      documentId: args.targetId,
    },
  };

  onTrace?.({
    detail: `目标 ${collection} #${args.targetId}，字段：${Object.keys(normalized.patch).join("、")}`,
    id: "tool-modify-record-prepare",
    kind: "write",
    status: "running",
    title: `准备修改「${document.title}」`,
  });

  const updated = await payload.update({
    collection,
    data: normalized.patch as never,
    id: args.targetId,
    overrideAccess: true,
  });

  const agentRun = await createAgentRun({
    affectedDocuments: [
      {
        collection,
        documentId: args.targetId,
        operation: "update",
        visibility:
          documentRecord.visibility === "public" || documentRecord.visibility === "private"
            ? documentRecord.visibility
            : "unknown",
      },
    ],
    afterSnapshot: Object.fromEntries(
      Object.keys(normalized.patch).map((field) => [
        field,
        (updated as unknown as Record<string, unknown>)[field] ?? null,
      ]),
    ),
    beforeSnapshot,
    goal: `修改${entityLabel[args.entityType]}「${document.title}」`,
    nextAction: null,
    payload,
    relatedPlan: args.entityType === "plan" ? args.targetId : undefined,
    rollbackAvailable: true,
    rollbackPayload,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `更新字段：${Object.keys(normalized.patch).join("、")}`,
      },
    ],
    summary: `Agent 已修改${entityLabel[args.entityType]}「${document.title}」`,
    title: `Agent modified ${args.entityType} · ${document.title}`,
    workflow: args.entityType === "timeline" || args.entityType === "checklist" ? "sync" : "planning",
  });

  onTrace?.({
    detail: `已更新 ${collection} #${args.targetId}`,
    id: "tool-modify-record-executed",
    kind: "write",
    status: "done",
    title: `已修改「${document.title}」`,
  });

  return createOwnedRollbackToolResult({
    affectedDocuments: [
      {
        collection,
        documentId: args.targetId,
        operation: "update",
        visibility:
          documentRecord.visibility === "public" || documentRecord.visibility === "private"
            ? documentRecord.visibility
            : "unknown",
      },
    ],
    assistantMessage: `已修改${entityLabel[args.entityType]}「${document.title}」：${Object.entries(normalized.patch)
      .map(([field, value]) => `${field}=${previewValue(value)}`)
      .join("，")}。`,
    pendingAction: null,
    rollbackPayload,
    rollbackSourceRunId: agentRun.id,
  });
};
