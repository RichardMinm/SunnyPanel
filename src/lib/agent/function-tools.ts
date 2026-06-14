import { parseAgentIntentResult, type AgentIntent, type AgentWriteIntentName } from "./schemas";
import { agentToolRegistry } from "./tool-registry";

export type OpenAIFunctionTool = {
  function: {
    description: string;
    name: string;
    parameters: {
      additionalProperties: boolean;
      properties: Record<string, unknown>;
      required: string[];
      type: "object";
    };
  };
  type: "function";
};

type ParameterHint = {
  description: string;
  enum?: string[];
  type: string;
};

const intentParameterHints: Record<AgentWriteIntentName, Record<string, ParameterHint>> = {
  add_completion_note: {
    checklistTitle: { description: "清单标题", type: "string" },
    completionNote: { description: "完成备注内容", type: "string" },
    groupTitle: { description: "分组标题（可选）", type: "string" },
    itemTitle: { description: "条目标题", type: "string" },
  },
  append_plan_item: {
    itemTitle: { description: "要追加的计划条目标题", type: "string" },
    planId: { description: "目标计划 ID", type: "number" },
    planTitle: { description: "计划标题（用于匹配）", type: "string" },
  },
  cancel_schedule_item: {
    scheduleItemId: { description: "要取消的日程项 ID", type: "number" },
    sourceText: { description: "用户原始描述", type: "string" },
  },
  complete_plan_item: {
    itemTitle: { description: "要完成的计划条目", type: "string" },
    planId: { description: "计划 ID", type: "number" },
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
  reschedule_item: {
    date: { description: "新日期 YYYY-MM-DD", type: "string" },
    endTime: { description: "新结束时间 HH:mm", type: "string" },
    scheduleItemId: { description: "日程项 ID", type: "number" },
    startTime: { description: "新开始时间 HH:mm", type: "string" },
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
  },
  modify_record: {
    entityName: { description: "要修改的实体名称", type: "string" },
    entityType: { description: "实体类型 plan/schedule/checklist/timeline", enum: ["plan", "schedule", "checklist", "timeline"], type: "string" },
    changeDescription: { description: "修改内容描述", type: "string" },
  },
};

const requiredFields: Partial<Record<AgentWriteIntentName, string[]>> = {
  add_completion_note: ["checklistTitle", "itemTitle", "completionNote"],
  append_plan_item: ["planId", "itemTitle"],
  cancel_schedule_item: ["scheduleItemId"],
  complete_plan_item: ["planId", "itemTitle"],
  compose_plan: ["goal", "title"],
  compose_schedule_item: ["date", "sourceText"],
  compose_timeline_event: ["title", "eventDate"],
  create_plan: ["title"],
  query_plan_progress: ["planTitle"],
  reschedule_item: ["scheduleItemId"],
  save_memory: ["content", "title"],
  schedule_plan: ["planId"],
  weekly_review: ["scope"],
  delete_record: ["entityName", "entityType"],
  modify_record: ["entityName", "entityType", "changeDescription"],
};

const writableIntents = Object.keys(agentToolRegistry) as AgentWriteIntentName[];

const toOpenAIProperty = (hint: ParameterHint) => {
  const property: Record<string, unknown> = {
    description: hint.description,
    type: hint.type,
  };

  if (hint.enum) {
    property.enum = hint.enum;
  }

  return property;
};

export const buildAgentFunctionTools = (): OpenAIFunctionTool[] =>
  writableIntents.map((intent) => {
    const definition = agentToolRegistry[intent];
    const properties = intentParameterHints[intent];
    const openAIProperties = Object.fromEntries(
      Object.entries(properties).map(([key, hint]) => [key, toOpenAIProperty(hint)]),
    );

    return {
      function: {
        description: definition.description,
        name: intent,
        parameters: {
          additionalProperties: true,
          properties: openAIProperties,
          required: requiredFields[intent] ?? Object.keys(properties).slice(0, 1),
          type: "object",
        },
      },
      type: "function",
    };
  });

export const isFunctionCallingEnabled = async () => {
  if (process.env.AGENT_FUNCTION_CALLING === "false" || process.env.AGENT_FUNCTION_CALLING === "0") {
    return false;
  }

  if (process.env.AGENT_FUNCTION_CALLING === "true" || process.env.AGENT_FUNCTION_CALLING === "1") {
    return true;
  }

  const { getAgentModelConfig } = await import("./client");
  const config = await getAgentModelConfig();

  return config?.provider === "openai" || config?.provider === "openai-compatible";
};

export const intentFromFunctionCall = (
  name: string,
  argsJson: string,
): AgentIntent | null => {
  if (!(writableIntents as string[]).includes(name)) {
    return null;
  }

  let args: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(argsJson) as unknown;
    args = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    args = {};
  }

  return (
    parseAgentIntentResult({
      args,
      confidence: 0.92,
      intent: name as AgentWriteIntentName,
    }) ?? null
  );
};
