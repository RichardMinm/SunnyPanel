import type { AgentIntent, AgentWriteIntentName } from "../schemas";

/** 会触发 DryRun→确认→Execute 链路的写入 intent（与 safety.ts 对齐）。 */
export const AGENT_WRITE_INTENT_NAMES = [
  "add_completion_note",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_checklist",
  "create_plan",
  "delete_record",
  "modify_record",
  "query_plan_progress",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
  "weekly_review",
] as const satisfies readonly AgentWriteIntentName[];

export const AGENT_WRITE_INTENTS = new Set<AgentIntent["intent"]>(AGENT_WRITE_INTENT_NAMES);

export const isAgentWriteIntent = (intent: AgentIntent["intent"]): intent is AgentWriteIntentName =>
  AGENT_WRITE_INTENTS.has(intent);

/** 编排冲突检测用的写入 intent 子集（含 delete/modify）。 */
export const ORCHESTRATION_WRITE_INTENTS = new Set([
  "compose_plan",
  "create_plan",
  "create_checklist",
  "append_plan_item",
  "complete_plan_item",
  "add_completion_note",
  "save_memory",
  "weekly_review",
  "compose_timeline_event",
  "cancel_schedule_item",
  "delete_record",
  "modify_record",
  "compose_schedule_item",
  "reschedule_item",
  "schedule_plan",
]);
