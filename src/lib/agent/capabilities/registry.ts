import { getPayloadClient } from "@/lib/payload/client";

import { getRelevantMemories } from "../memory";
import { getAgentProgressSnapshot } from "../progress";
import type { AgentWriteIntentName, ComposePlanArgs } from "../schemas";
import { queryPlanProgressFromIntent } from "../tools/query-tools";
import { composePlanProposal } from "../workflows/plan-composer";
import { composeTimelineEventProposal } from "../workflows/timeline-composer";
import { CAPABILITY_INPUT_SCHEMAS, CAPABILITY_OUTPUT_SCHEMAS } from "./schemas";
import type { AgentCapability, CapabilityResult } from "./types";

const ok = (summary: string, data?: unknown): CapabilityResult => ({ data, ok: true, summary });
const fail = (summary: string, error?: string): CapabilityResult => ({ error, ok: false, summary });

const asRecord = (input: unknown): Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

const executeSearchPlans = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const planTitle = str(args.planTitle) || str(args.query);

  if (planTitle || num(args.planId)) {
    const result = await queryPlanProgressFromIntent({
      planId: num(args.planId),
      planTitle: planTitle || undefined,
    });

    return ok(result.assistantMessage);
  }

  const payload = await getPayloadClient();
  const plans = await payload.find({
    collection: "plans",
    depth: 0,
    limit: 20,
    overrideAccess: true,
    sort: "-updatedAt",
  });

  if (plans.docs.length === 0) {
    return ok("当前没有计划。");
  }

  const lines = plans.docs.map(
    (plan) => `- [${plan.id}] ${plan.title}（${plan.state}，优先级 ${plan.priority}）`,
  );

  return ok(`找到 ${plans.docs.length} 个计划：\n${lines.join("\n")}`);
};

const executeSearchSchedules = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const payload = await getPayloadClient();
  const where =
    str(args.date).length > 0
      ? { date: { equals: str(args.date) } }
      : num(args.scheduleItemId)
        ? { id: { equals: num(args.scheduleItemId) } }
        : undefined;

  const result = await payload.find({
    collection: "schedule-items",
    depth: 0,
    limit: 20,
    overrideAccess: true,
    sort: "startTime",
    ...(where ? { where: where as any } : {}),
  });

  const query = str(args.query).toLowerCase();
  const docs = query
    ? result.docs.filter((item) => item.title.toLowerCase().includes(query))
    : result.docs;

  if (docs.length === 0) {
    return ok("没有找到匹配的日程。");
  }

  const lines = docs.map(
    (item) =>
      `- [${item.id}] ${item.date} ${item.startTime ?? ""}-${item.endTime ?? ""} ${item.title}`,
  );

  return ok(`找到 ${docs.length} 条日程：\n${lines.join("\n")}`);
};

const executeSearchChecklists = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const snapshot = await getAgentProgressSnapshot({
    checklistTitle: str(args.checklistTitle) || str(args.query) || undefined,
    scope: "checklists",
  });

  const lines = snapshot.checklists.map(
    (item) =>
      `- ${item.title}：${item.completedItems}/${item.totalItems}（${Math.round(item.completionRate * 100)}%）`,
  );

  return ok(
    [
      `清单 ${snapshot.summary.checklistCount} 份，整体完成率 ${Math.round(snapshot.summary.overallChecklistCompletionRate * 100)}%`,
      lines.length > 0 ? lines.join("\n") : "（暂无清单进度）",
    ].join("\n"),
    snapshot,
  );
};

const executeSearchMemory = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const query = str(args.query);

  if (!query) {
    return fail("请提供记忆搜索关键词。");
  }

  const limit = num(args.limit) ?? 6;
  const memories = await getRelevantMemories(query, limit, str(args.type) || undefined);
  const filtered = str(args.type)
    ? memories.filter((memory) => memory.type === str(args.type))
    : memories;

  if (filtered.length === 0) {
    return ok("没有找到相关记忆。");
  }

  const lines = filtered.map((memory) => `- [${memory.type}] ${memory.title}：${memory.content}`);

  return ok(`找到 ${filtered.length} 条记忆：\n${lines.join("\n")}`);
};

const executeSearchTimeline = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "timeline-events",
    depth: 0,
    limit: 20,
    overrideAccess: true,
    sort: "-eventDate",
  });

  const query = str(args.query).toLowerCase();
  const typeFilter = str(args.type);
  const docs = result.docs.filter((event) => {
    if (typeFilter && event.type !== typeFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return event.title.toLowerCase().includes(query) || (event.description ?? "").toLowerCase().includes(query);
  });

  if (docs.length === 0) {
    return ok("没有找到匹配的时间线事件。");
  }

  const lines = docs.map((event) => `- [${event.id}] ${event.eventDate} ${event.title}（${event.type}）`);

  return ok(`找到 ${docs.length} 个时间线节点：\n${lines.join("\n")}`);
};

const executeDraftPlan = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const composeArgs: ComposePlanArgs = {
    goal: str(args.goal),
    scope: str(args.scope) || null,
    sourceText: str(args.title),
    suggestedDueDate: str(args.dueDate) || null,
    suggestedPriority: (str(args.priority) as ComposePlanArgs["suggestedPriority"]) || "medium",
    title: str(args.title),
  };
  const proposal = composePlanProposal(composeArgs);

  return ok(`计划草案「${proposal.title}」已生成（未写入数据库）。`, proposal);
};

const executeDraftChecklist = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const title = str(args.title) || "未命名清单";
  const groups = Array.isArray(args.groups) ? args.groups : [{ items: [{ title: "示例条目" }], title: "默认分组" }];

  return ok(`清单草案「${title}」已生成（未写入数据库）。`, { groups, title });
};

const executeDraftWritingOutline = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const title = str(args.title) || "未命名文档";
  const text = [str(args.summary), str(args.text)].filter(Boolean).join("\n");

  if (process.env.AGENT_DISABLE_LLM !== "1") {
    try {
      const { runWritingAssist } = await import("../writing-assist-core");
      const result = await runWritingAssist({
        action: "generate_outline",
        summary: str(args.summary) || undefined,
        text: str(args.text) || undefined,
        title,
      });

      if (result.outline?.length) {
        return ok(`写作大纲草案「${title}」已生成（未写入数据库）。`, {
          outline: result.outline,
          title,
        });
      }
    } catch {
      // fallback below
    }
  }

  const outline = text
    ? text
        .split(/\n+/)
        .filter(Boolean)
        .slice(0, 8)
        .map((line, index) => ({ level: index === 0 ? 1 : 2, text: line }))
    : [
        { level: 1, text: "引言" },
        { level: 2, text: "背景与动机" },
        { level: 1, text: "正文" },
        { level: 1, text: "总结" },
      ];

  return ok(`写作大纲草案「${title}」已生成（未写入数据库）。`, { outline, title });
};

const executeDraftTimelineEvent = async (input: unknown): Promise<CapabilityResult> => {
  const args = asRecord(input);
  const proposal = composeTimelineEventProposal({
    eventDate: str(args.eventDate),
    sourceText: str(args.description) || str(args.title),
    sourceTitle: str(args.title) || null,
    type: (str(args.type) as "life" | "milestone" | "project") || "milestone",
    visibility: "private",
  });

  if (!proposal) {
    return fail("时间线事件草案信息不足，请补充标题与日期。");
  }

  return ok(`时间线事件草案「${proposal.title}」已生成（未写入数据库）。`, proposal);
};

const notImplemented = (name: string): CapabilityResult => ({
  error: "NotImplemented",
  ok: false,
  summary: `${name} 尚未实现，需走特殊确认流。`,
});

const defineCapability = (
  partial: Omit<AgentCapability, "execute" | "inputSchema" | "outputSchema"> & {
    execute?: AgentCapability["execute"];
  },
): AgentCapability => ({
  ...partial,
  execute:
    partial.execute ??
    (async (input, ctx) => {
      if (partial.action === "preview") {
        const { runPreviewCapability } = await import("./adapters");

        return runPreviewCapability(partial.name, input, ctx);
      }

      if (partial.action === "execute") {
        const { runExecuteCapability } = await import("./adapters");

        return runExecuteCapability(partial.name, input, ctx);
      }

      return notImplemented(partial.name);
    }),
  inputSchema: CAPABILITY_INPUT_SCHEMAS[partial.name] ?? { properties: {}, type: "object" },
  outputSchema: CAPABILITY_OUTPUT_SCHEMAS[partial.name] ?? { type: "object" },
});

const previewMeta = (
  name: string,
  target: AgentCapability["target"],
  legacyIntent: AgentWriteIntentName,
  description: string,
): AgentCapability =>
  defineCapability({
    action: "preview",
    description,
    exposableToLLM: true,
    legacyIntent,
    name,
    requiresConfirmation: true,
    risk: "write_preview",
    sideEffect: false,
    target,
  });

const executeMeta = (
  name: string,
  target: AgentCapability["target"],
  legacyIntent: AgentWriteIntentName,
  description: string,
): AgentCapability =>
  defineCapability({
    action: "execute",
    description,
    exposableToLLM: false,
    legacyIntent,
    name,
    requiresConfirmation: true,
    risk: "write_execute",
    sideEffect: true,
    target,
  });

export const CAPABILITY_REGISTRY: Record<string, AgentCapability> = {
  search_plans: defineCapability({
    action: "search",
    description: "搜索或列出计划，返回进度摘要。",
    execute: executeSearchPlans,
    exposableToLLM: true,
    name: "search_plans",
    requiresConfirmation: false,
    risk: "read",
    sideEffect: false,
    target: "plan",
  }),
  search_schedules: defineCapability({
    action: "search",
    description: "搜索日程项，按日期或关键词过滤。",
    execute: executeSearchSchedules,
    exposableToLLM: true,
    name: "search_schedules",
    requiresConfirmation: false,
    risk: "read",
    sideEffect: false,
    target: "schedule",
  }),
  search_checklists: defineCapability({
    action: "search",
    description: "查询清单与完成进度。",
    execute: executeSearchChecklists,
    exposableToLLM: true,
    name: "search_checklists",
    requiresConfirmation: false,
    risk: "read",
    sideEffect: false,
    target: "checklist",
  }),
  search_memory: defineCapability({
    action: "search",
    description: "检索用户私有记忆。",
    execute: executeSearchMemory,
    exposableToLLM: true,
    name: "search_memory",
    requiresConfirmation: false,
    risk: "read",
    sideEffect: false,
    target: "memory",
  }),
  search_timeline: defineCapability({
    action: "search",
    description: "搜索时间线事件。",
    execute: executeSearchTimeline,
    exposableToLLM: true,
    name: "search_timeline",
    requiresConfirmation: false,
    risk: "read",
    sideEffect: false,
    target: "timeline",
  }),
  draft_plan: defineCapability({
    action: "draft",
    description: "生成计划提案 JSON，不写库。",
    execute: executeDraftPlan,
    exposableToLLM: true,
    name: "draft_plan",
    requiresConfirmation: false,
    risk: "draft",
    sideEffect: false,
    target: "plan",
  }),
  draft_checklist: defineCapability({
    action: "draft",
    description: "生成清单结构草案，不写库。",
    execute: executeDraftChecklist,
    exposableToLLM: true,
    name: "draft_checklist",
    requiresConfirmation: false,
    risk: "draft",
    sideEffect: false,
    target: "checklist",
  }),
  draft_writing_outline: defineCapability({
    action: "draft",
    description: "生成写作大纲草案，不写库。",
    execute: executeDraftWritingOutline,
    exposableToLLM: true,
    name: "draft_writing_outline",
    requiresConfirmation: false,
    risk: "draft",
    sideEffect: false,
    target: "writing",
  }),
  draft_timeline_event: defineCapability({
    action: "draft",
    description: "生成时间线事件提案，不写库。",
    execute: executeDraftTimelineEvent,
    exposableToLLM: true,
    name: "draft_timeline_event",
    requiresConfirmation: false,
    risk: "draft",
    sideEffect: false,
    target: "timeline",
  }),
  preview_create_plan: previewMeta(
    "preview_create_plan",
    "plan",
    "create_plan",
    "预览创建计划的影响（DryRun，需确认后执行）。",
  ),
  preview_create_schedule: previewMeta(
    "preview_create_schedule",
    "schedule",
    "compose_schedule_item",
    "预览创建日程的影响（DryRun，需确认后执行）。",
  ),
  preview_create_schedule_items: previewMeta(
    "preview_create_schedule_items",
    "schedule",
    "create_schedule_items",
    "预览批量创建日程的影响（DryRun，需确认后执行）。",
  ),
  preview_update_plan: previewMeta(
    "preview_update_plan",
    "plan",
    "modify_record",
    "预览更新计划的影响（DryRun，需确认后执行）。",
  ),
  preview_update_schedule: previewMeta(
    "preview_update_schedule",
    "schedule",
    "reschedule_item",
    "预览更新日程的影响（DryRun，需确认后执行）。",
  ),
  preview_delete_plan: previewMeta(
    "preview_delete_plan",
    "plan",
    "delete_record",
    "预览删除计划的影响（DryRun，需确认后执行）。",
  ),
  preview_delete_schedule: previewMeta(
    "preview_delete_schedule",
    "schedule",
    "cancel_schedule_item",
    "预览取消/删除日程的影响（DryRun，需确认后执行）。",
  ),
  preview_update_checklist: previewMeta(
    "preview_update_checklist",
    "checklist",
    "modify_record",
    "预览更新清单的影响（DryRun，需确认后执行）。",
  ),
  preview_delete_checklist: previewMeta(
    "preview_delete_checklist",
    "checklist",
    "delete_record",
    "预览删除清单的影响（DryRun，需确认后执行）。",
  ),
  preview_create_timeline: previewMeta(
    "preview_create_timeline",
    "timeline",
    "compose_timeline_event",
    "预览创建时间线节点的影响（DryRun，需确认后执行）。",
  ),
  preview_delete_timeline: previewMeta(
    "preview_delete_timeline",
    "timeline",
    "delete_record",
    "预览删除时间线节点的影响（DryRun，需确认后执行）。",
  ),
  execute_create_plan: executeMeta(
    "execute_create_plan",
    "plan",
    "create_plan",
    "确认后创建计划（后端专用，不对 LLM 暴露）。",
  ),
  execute_create_schedule: executeMeta(
    "execute_create_schedule",
    "schedule",
    "compose_schedule_item",
    "确认后创建日程（后端专用）。",
  ),
  execute_create_schedule_items: executeMeta(
    "execute_create_schedule_items",
    "schedule",
    "create_schedule_items",
    "确认后批量创建日程（K5 防御性 no-write，K6 实现写入）。",
  ),
  execute_update_plan: executeMeta(
    "execute_update_plan",
    "plan",
    "modify_record",
    "确认后更新计划（后端专用）。",
  ),
  execute_update_schedule: executeMeta(
    "execute_update_schedule",
    "schedule",
    "reschedule_item",
    "确认后更新日程（后端专用）。",
  ),
  execute_delete_plan: executeMeta(
    "execute_delete_plan",
    "plan",
    "delete_record",
    "确认后删除计划（后端专用）。",
  ),
  execute_delete_schedule: executeMeta(
    "execute_delete_schedule",
    "schedule",
    "cancel_schedule_item",
    "确认后取消日程（后端专用）。",
  ),
  execute_update_checklist: executeMeta(
    "execute_update_checklist",
    "checklist",
    "modify_record",
    "确认后更新清单（后端专用）。",
  ),
  execute_delete_checklist: executeMeta(
    "execute_delete_checklist",
    "checklist",
    "delete_record",
    "确认后删除清单（后端专用）。",
  ),
  execute_create_timeline: executeMeta(
    "execute_create_timeline",
    "timeline",
    "compose_timeline_event",
    "确认后创建时间线节点（后端专用）。",
  ),
  execute_delete_timeline: executeMeta(
    "execute_delete_timeline",
    "timeline",
    "delete_record",
    "确认后删除时间线节点（后端专用）。",
  ),
  execute_bulk_delete_plans: defineCapability({
    action: "execute",
    description: "批量删除计划（危险操作，占位）。",
    execute: async () => notImplemented("execute_bulk_delete_plans"),
    exposableToLLM: false,
    name: "execute_bulk_delete_plans",
    requiresConfirmation: true,
    risk: "dangerous",
    sideEffect: true,
    target: "plan",
  }),
  execute_clear_schedule_day: defineCapability({
    action: "execute",
    description: "清空某日全部日程（危险操作，占位）。",
    execute: async () => notImplemented("execute_clear_schedule_day"),
    exposableToLLM: false,
    name: "execute_clear_schedule_day",
    requiresConfirmation: true,
    risk: "dangerous",
    sideEffect: true,
    target: "schedule",
  }),
  publish_private_content: defineCapability({
    action: "execute",
    description: "发布私有内容（危险操作，占位）。",
    execute: async () => notImplemented("publish_private_content"),
    exposableToLLM: false,
    name: "publish_private_content",
    requiresConfirmation: true,
    risk: "dangerous",
    sideEffect: true,
    target: "writing",
  }),
};

export const getCapability = (name: string): AgentCapability | null => CAPABILITY_REGISTRY[name] ?? null;

export const listCapabilities = (): AgentCapability[] => Object.values(CAPABILITY_REGISTRY);

export const listExposableCapabilities = (): AgentCapability[] =>
  listCapabilities().filter(
    (cap) =>
      cap.exposableToLLM &&
      cap.risk !== "write_execute" &&
      cap.risk !== "dangerous",
  );

export const isPreviewCapabilityName = (name: string) => name.startsWith("preview_");

export const isExecuteCapabilityName = (name: string) =>
  name.startsWith("execute_") || name === "publish_private_content";

export const isReadCapabilityName = (name: string) => name.startsWith("search_");

export const isDraftCapabilityName = (name: string) => name.startsWith("draft_");

export const isSideEffectPreviewCapability = (name: string) => isPreviewCapabilityName(name);
