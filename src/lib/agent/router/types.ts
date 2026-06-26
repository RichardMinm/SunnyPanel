import type { AgentIntent } from "../schemas";

/** 用户层 action 分类（Router 输出契约）。 */
export type AgentRouterAction =
  | "query"
  | "create"
  | "update"
  | "delete"
  | "capability"
  | "expand"
  | "clarify"
  | "answer";

export type AgentTargetRef = {
  collection?: "checklists" | "plans" | "schedule-items" | "timeline-events" | null;
  entityName?: null | string;
  entityType?: "checklist" | "plan" | "schedule" | "timeline" | "writing" | null;
  /** 对话追问：继承上一轮主题 */
  kind?: "last_topic" | "named";
  targetId?: null | number;
  topic?: null | string;
};

export type AgentRouterOutput = {
  action: AgentRouterAction;
  confidence: number;
  intent: AgentIntent;
  reason: string;
  requiresWrite: boolean;
  target: AgentTargetRef;
};
