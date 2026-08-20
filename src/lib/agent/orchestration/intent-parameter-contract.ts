import type { AgentWriteIntentName } from "../schemas";

export type AgentIntentParameterHint = {
  description: string;
  enum?: string[];
  type: string;
};
export const AGENT_INTENT_PARAMETER_HINTS: Record<
  AgentWriteIntentName,
  Record<string, AgentIntentParameterHint>
> = {
  add_completion_note: {
    checklistTitle: { description: "清单标题", type: "string" },
    completionNote: { description: "完成备注内容", type: "string" },
    groupTitle: { description: "分组标题（可选）", type: "string" },
    itemTitle: { description: "条目标题", type: "string" },
  },
  append_plan_item: {
    checklistTitle: { description: "目标清单标题", type: "string" },
    createGroupIfMissing: { description: "分组不存在时是否创建", type: "boolean" },
    description: { description: "条目说明（可选）", type: "string" },
    groupTitle: { description: "目标分组标题（可选）", type: "string" },
    itemTitle: { description: "要追加的清单条目标题", type: "string" },
  },
  cancel_schedule_item: {
    itemId: { description: "要取消的日程项 ID", type: "number" },
    reason: { description: "取消原因（可选）", type: "string" },
  },
  complete_plan_item: {
    checklistTitle: { description: "目标清单标题", type: "string" },
    completedAt: { description: "完成时间 ISO 日期（可选）", type: "string" },
    completionNote: { description: "完成备注（可选）", type: "string" },
    groupTitle: { description: "目标分组标题（可选）", type: "string" },
    itemTitle: { description: "要完成的清单条目", type: "string" },
  },
  compose_checklist: {
    goal: { description: "清单目标", type: "string" },
    items: { description: "待办条目数组", type: "array" },
    title: { description: "清单标题", type: "string" },
  },
  compose_plan: {
    dueDate: { description: "期望完成日期 YYYY-MM-DD", type: "string" },
    goal: { description: "计划目标（一句话成果）", type: "string" },
    priority: { description: "优先级", enum: ["high", "medium", "low"], type: "string" },
    scope: { description: "范围说明（包含/不包含）", type: "string" },
    title: { description: "计划标题", type: "string" },
  },
  compose_schedule_item: {
    date: { description: "日期 YYYY-MM-DD", type: "string" },
    endTime: { description: "结束时间 HH:mm", type: "string" },
    planId: { description: "关联计划 ID", type: "number" },
    priority: { description: "优先级", enum: ["high", "medium", "low"], type: "string" },
    sourceText: { description: "用户原始排期描述", type: "string" },
    startTime: { description: "开始时间 HH:mm", type: "string" },
    title: { description: "日程标题", type: "string" },
  },
  compose_timeline_event: {
    description: { description: "事件描述", type: "string" },
    eventDate: { description: "事件日期 ISO 或 YYYY-MM-DD", type: "string" },
    title: { description: "时间线节点标题", type: "string" },
    type: {
      description: "事件类型",
      enum: ["milestone", "project", "life", "work"],
      type: "string",
    },
    visibility: { description: "可见性", enum: ["public", "private"], type: "string" },
  },
  create_checklist: {
    groups: { description: "清单分组与条目", type: "array" },
    sourcePlanId: { description: "真实来源计划 ID；只有已知具体 Plan id 时填写", type: "number" },
    sourceText: { description: "来源草案或用户原始描述", type: "string" },
    status: { description: "内容状态", enum: ["draft", "published"], type: "string" },
    summary: { description: "清单说明", type: "string" },
    title: { description: "清单标题", type: "string" },
    visibility: { description: "可见性", enum: ["public", "private"], type: "string" },
  },
  create_schedule_items: {
    items: { description: "要批量创建的日程项数组", type: "array" },
    sourceChecklistId: { description: "来源清单 ID", type: "number" },
    sourcePlanId: { description: "来源计划 ID", type: "number" },
    sourceText: { description: "来源草案或用户原始描述", type: "string" },
    sourceType: { description: "来源类型", enum: ["plan", "checklist", "manual"], type: "string" },
    title: { description: "日程草案标题", type: "string" },
  },
  create_plan: {
    description: { description: "计划说明（1-3 句）", type: "string" },
    dueDate: { description: "截止日期 YYYY-MM-DD", type: "string" },
    executionMode: { description: "执行模式", enum: ["manual", "agent", "hybrid"], type: "string" },
    priority: { description: "优先级", enum: ["high", "medium", "low"], type: "string" },
    title: { description: "计划标题", type: "string" },
  },
  query_plan_progress: {
    planId: { description: "计划 ID", type: "number" },
    planTitle: { description: "计划标题（用于匹配）", type: "string" },
  },
  query_schedule: {
    endDate: { description: "结束日期 YYYY-MM-DD", type: "string" },
    limit: { description: "返回数量上限", type: "number" },
    range: {
      description: "查询范围",
      enum: ["today", "tomorrow", "this_week", "next_week", "upcoming"],
      type: "string",
    },
    startDate: { description: "开始日期 YYYY-MM-DD", type: "string" },
  },
  reschedule_item: {
    itemId: { description: "日程项 ID", type: "number" },
    newDate: { description: "新日期 YYYY-MM-DD", type: "string" },
    newEndTime: { description: "新结束时间 HH:mm", type: "string" },
    newStartTime: { description: "新开始时间 HH:mm", type: "string" },
    newTitle: { description: "新标题（可选）", type: "string" },
    reason: { description: "改期原因（可选）", type: "string" },
  },
  save_memory: {
    confidence: { description: "置信度 0-1", type: "number" },
    content: { description: "要记住的内容", type: "string" },
    title: { description: "记忆标题", type: "string" },
    type: {
      description: "记忆类型",
      enum: ["preference", "fact", "project_context", "workflow_rule", "writing_style"],
      type: "string",
    },
  },
  schedule_plan: {
    planId: { description: "计划 ID", type: "number" },
    planTitle: { description: "计划标题（用于匹配）", type: "string" },
    startDate: { description: "排期起始日期 YYYY-MM-DD", type: "string" },
  },
  weekly_review: {
    scope: { description: "复盘范围 week/month", enum: ["week", "month"], type: "string" },
    weekKey: { description: "周标识如 2026-W20", type: "string" },
  },
  delete_record: {
    entityName: { description: "要删除的实体名称", type: "string" },
    entityType: { description: "实体类型 plan/schedule/checklist/timeline", enum: ["plan", "schedule", "checklist", "timeline"], type: "string" },
    targetId: { description: "目标文档 ID（已知时优先提供）", type: "number" },
  },
  modify_record: {
    entityName: { description: "要修改的实体名称", type: "string" },
    entityType: { description: "实体类型 plan/schedule/checklist/timeline", enum: ["plan", "schedule", "checklist", "timeline"], type: "string" },
    changeDescription: { description: "修改内容描述", type: "string" },
    patch: { description: "仅包含目标实体允许的安全标量字段和值", type: "object" },
    targetId: { description: "目标文档 ID（已知时优先提供）", type: "number" },
  },
};

export const AGENT_INTENT_REQUIRED_FIELDS: Partial<
  Record<AgentWriteIntentName, string[]>
> = {
  add_completion_note: ["checklistTitle", "itemTitle", "completionNote"],
  append_plan_item: ["checklistTitle", "itemTitle"],
  cancel_schedule_item: ["itemId"],
  complete_plan_item: ["checklistTitle", "itemTitle"],
  compose_checklist: [],
  compose_plan: ["goal", "title"],
  compose_schedule_item: ["date", "sourceText"],
  compose_timeline_event: ["title", "eventDate"],
  create_checklist: ["title", "groups"],
  create_schedule_items: ["items"],
  create_plan: ["title"],
  query_plan_progress: ["planTitle"],
  query_schedule: [],
  reschedule_item: ["itemId"],
  save_memory: ["content", "title"],
  schedule_plan: ["planId"],
  weekly_review: ["scope"],
  delete_record: ["entityName", "entityType"],
  modify_record: ["entityName", "entityType", "changeDescription"],
};
