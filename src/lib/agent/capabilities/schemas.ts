/** OpenAI function parameter schemas per capability (LLM-facing). */

const stringProp = (description: string) => ({ description, type: "string" });
const numberProp = (description: string) => ({ description, type: "number" });

export const CAPABILITY_INPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  search_plans: {
    additionalProperties: true,
    properties: {
      planId: numberProp("计划 ID"),
      planTitle: stringProp("计划标题（模糊匹配）"),
      query: stringProp("搜索关键词"),
    },
    required: [],
    type: "object",
  },
  search_schedules: {
    additionalProperties: true,
    properties: {
      date: stringProp("日期 YYYY-MM-DD"),
      query: stringProp("搜索关键词"),
      scheduleItemId: numberProp("日程项 ID"),
    },
    required: [],
    type: "object",
  },
  search_checklists: {
    additionalProperties: true,
    properties: {
      checklistTitle: stringProp("清单标题"),
      query: stringProp("搜索关键词"),
      scope: { description: "范围", enum: ["all", "checklists"], type: "string" },
    },
    required: [],
    type: "object",
  },
  search_memory: {
    additionalProperties: true,
    properties: {
      limit: numberProp("返回条数上限"),
      query: stringProp("记忆搜索关键词"),
      type: {
        description: "记忆类型",
        enum: ["preference", "fact", "project_context", "workflow_rule", "writing_style"],
        type: "string",
      },
    },
    required: ["query"],
    type: "object",
  },
  search_timeline: {
    additionalProperties: true,
    properties: {
      query: stringProp("搜索关键词"),
      type: { description: "事件类型", enum: ["milestone", "project", "life", "work"], type: "string" },
    },
    required: [],
    type: "object",
  },
  draft_plan: {
    additionalProperties: true,
    properties: {
      dueDate: stringProp("截止日期 YYYY-MM-DD"),
      goal: stringProp("计划目标"),
      priority: { description: "优先级", enum: ["high", "medium", "low"], type: "string" },
      scope: stringProp("范围说明"),
      title: stringProp("计划标题"),
    },
    required: ["goal", "title"],
    type: "object",
  },
  draft_checklist: {
    additionalProperties: true,
    properties: {
      groups: { description: "分组与条目草案", type: "array" },
      title: stringProp("清单标题"),
    },
    required: ["title"],
    type: "object",
  },
  draft_writing_outline: {
    additionalProperties: true,
    properties: {
      summary: stringProp("已有摘要"),
      text: stringProp("正文片段"),
      title: stringProp("文档标题"),
    },
    required: ["title"],
    type: "object",
  },
  draft_timeline_event: {
    additionalProperties: true,
    properties: {
      description: stringProp("事件描述"),
      eventDate: stringProp("事件日期"),
      title: stringProp("节点标题"),
      type: { description: "事件类型", enum: ["milestone", "project", "life", "work"], type: "string" },
    },
    required: ["title", "eventDate"],
    type: "object",
  },
  preview_create_plan: {
    additionalProperties: true,
    properties: {
      description: stringProp("计划说明"),
      dueDate: stringProp("截止日期"),
      goal: stringProp("计划目标（compose 模式）"),
      priority: { description: "优先级", enum: ["high", "medium", "low"], type: "string" },
      title: stringProp("计划标题"),
    },
    required: ["title"],
    type: "object",
  },
  preview_create_schedule: {
    additionalProperties: true,
    properties: {
      date: stringProp("日期 YYYY-MM-DD"),
      endTime: stringProp("结束时间 HH:mm"),
      sourceText: stringProp("用户原始排期描述"),
      startTime: stringProp("开始时间 HH:mm"),
      title: stringProp("日程标题"),
    },
    required: ["date", "sourceText"],
    type: "object",
  },
  preview_create_schedule_items: {
    additionalProperties: true,
    properties: {
      items: { description: "批量日程项", type: "array" },
      sourceChecklistId: numberProp("来源清单 ID"),
      sourcePlanId: numberProp("来源计划 ID"),
      title: stringProp("日程草案标题"),
    },
    required: ["items"],
    type: "object",
  },
  preview_update_plan: {
    additionalProperties: true,
    properties: {
      changeDescription: stringProp("修改内容描述"),
      entityName: stringProp("计划名称"),
      patch: { description: "安全字段 patch", type: "object" },
      targetId: numberProp("计划 ID"),
    },
    required: ["entityName", "changeDescription"],
    type: "object",
  },
  preview_update_schedule: {
    additionalProperties: true,
    properties: {
      date: stringProp("新日期"),
      endTime: stringProp("新结束时间"),
      scheduleItemId: numberProp("日程项 ID"),
      startTime: stringProp("新开始时间"),
    },
    required: ["scheduleItemId"],
    type: "object",
  },
  preview_delete_plan: {
    additionalProperties: true,
    properties: {
      entityName: stringProp("计划名称"),
      targetId: numberProp("计划 ID"),
    },
    required: ["entityName"],
    type: "object",
  },
  preview_delete_schedule: {
    additionalProperties: true,
    properties: {
      scheduleItemId: numberProp("日程项 ID"),
      sourceText: stringProp("用户描述"),
    },
    required: ["scheduleItemId"],
    type: "object",
  },
  execute_create_plan: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_create_schedule: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_create_schedule_items: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_update_plan: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_update_schedule: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_delete_plan: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_delete_schedule: {
    additionalProperties: true,
    properties: { actionId: stringProp("已确认提案 ID") },
    required: ["actionId"],
    type: "object",
  },
  execute_bulk_delete_plans: {
    additionalProperties: false,
    properties: {},
    required: [],
    type: "object",
  },
  execute_clear_schedule_day: {
    additionalProperties: true,
    properties: { date: stringProp("日期 YYYY-MM-DD") },
    required: ["date"],
    type: "object",
  },
  publish_private_content: {
    additionalProperties: true,
    properties: { documentId: numberProp("文档 ID") },
    required: ["documentId"],
    type: "object",
  },
};

export const CAPABILITY_OUTPUT_SCHEMAS: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.keys(CAPABILITY_INPUT_SCHEMAS).map((name) => [name, { properties: { summary: { type: "string" } }, type: "object" }]),
);
