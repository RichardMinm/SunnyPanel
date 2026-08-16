import { enrichContentIntent } from "./content-agent";
import { enrichMemoryIntent } from "./memory-agent";
import { enrichPlanIntent } from "./plan-agent";
import { enrichReviewIntent } from "./review-agent";
import { enrichScheduleIntent } from "./schedule-agent";
import type { SpecializedAgentDefinition } from "./types";

export const planAgentDefinition: SpecializedAgentDefinition = {
  enrichIntent: enrichPlanIntent,
  id: "plan",
  role: "plan",
  supportedIntents: [
    "create_plan",
    "compose_plan",
    "append_plan_item",
    "complete_plan_item",
    "schedule_plan",
    "evaluate_plan",
  ],
  systemPromptHint: "计划创建、拆解、评估与清单联动",
};

export const scheduleAgentDefinition: SpecializedAgentDefinition = {
  enrichIntent: enrichScheduleIntent,
  id: "schedule",
  role: "schedule",
  supportedIntents: ["compose_schedule_item", "create_schedule_items", "reschedule_item", "cancel_schedule_item", "schedule_plan"],
  systemPromptHint: "日程排期、冲突与时间段推理",
};

export const reviewAgentDefinition: SpecializedAgentDefinition = {
  enrichIntent: enrichReviewIntent,
  id: "review",
  role: "review",
  supportedIntents: ["weekly_review", "evaluate_plan", "query_plan_progress"],
  systemPromptHint: "周报复盘与计划健康度",
};

export const memoryAgentDefinition: SpecializedAgentDefinition = {
  enrichIntent: enrichMemoryIntent,
  id: "memory",
  role: "memory",
  supportedIntents: ["save_memory"],
  systemPromptHint: "长期偏好与规则记忆",
};

export const contentAgentDefinition: SpecializedAgentDefinition = {
  enrichIntent: enrichContentIntent,
  id: "content",
  role: "content",
  supportedIntents: ["compose_timeline_event", "add_completion_note"],
  systemPromptHint: "内容叙事与时间线节点",
};

export const queryAgentDefinition: SpecializedAgentDefinition = {
  id: "query",
  role: "query",
  supportedIntents: ["query_progress", "query_plan_progress", "answer_question"],
  systemPromptHint: "进度查询与只读分析",
};

export const specializedAgentRegistry: Record<SpecializedAgentDefinition["id"], SpecializedAgentDefinition> = {
  content: contentAgentDefinition,
  memory: memoryAgentDefinition,
  plan: planAgentDefinition,
  query: queryAgentDefinition,
  review: reviewAgentDefinition,
  schedule: scheduleAgentDefinition,
};

export const getSpecializedAgent = (id: SpecializedAgentDefinition["id"]) => specializedAgentRegistry[id];
