import type { AgentTraceStep } from "@/lib/agent/schemas";
import type { DashboardIconName } from "@/components/dashboard/icons";

import type { AgentInspectorTab } from "./types";

export const inspectorTabs: Array<{ key: AgentInspectorTab; label: string; icon: DashboardIconName }> = [
  { key: "context", label: "上下文", icon: "thinking" },
  { key: "approval", label: "进度", icon: "checklist" },
  { key: "linked", label: "关联", icon: "project" },
  { key: "memory", label: "记忆", icon: "memory" },
  { key: "trace", label: "详细", icon: "command" },
  { key: "inbox", label: "建议", icon: "inbox" },
  { key: "debug", label: "调试", icon: "command" },
];

export const traceKindLabelMap: Record<AgentTraceStep["kind"], string> = {
  action: "动作",
  analysis: "推理",
  complete: "完成",
  context: "上下文",
  error: "错误",
  write: "写入",
};

export const operationLabelMap = {
  create: "创建",
  delete: "删除",
  update: "更新",
} as const;

export const riskLevelLabelMap = {
  high: "高风险",
  low: "低风险",
  medium: "中风险",
} as const;

export const priorityLabelMap = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
} as const;

export const agentRoleLabelMap = {
  content: "内容",
  memory: "记忆",
  plan: "计划",
  query: "查询",
  review: "复盘",
  schedule: "日程",
} as const;

export const runStepLevelLabelMap: Record<string, string> = {
  debug: "调试",
  error: "错误",
  info: "信息",
  warn: "警告",
  warning: "警告",
};

export const traceStatusLabelMap = {
  done: "完成",
  error: "错误",
  running: "运行中",
} as const;

export const visibilityLabelMap = {
  private: "私有",
  public: "公开",
  unknown: "未知",
} as const;

export const intentLabelMap: Record<string, string> = {
  add_completion_note: "添加完成备注",
  answer_question: "回答问题",
  append_plan_item: "追加计划项",
  cancel_schedule_item: "取消日程",
  capability_query: "能力查询",
  clarify: "澄清问题",
  complete_plan_item: "完成计划项",
  compose_plan: "创建计划",
  compose_schedule_item: "安排日程",
  compose_timeline_event: "记录时间线",
  create_plan: "新建计划",
  delete_record: "删除记录",
  evaluate_plan: "评估计划",
  modify_record: "修改记录",
  query_checklist_progress: "查询清单进度",
  query_memory: "查询记忆",
  query_plan: "查询计划",
  query_plan_progress: "查询进度",
  query_progress: "查询进度",
  query_schedule: "查询日程",
  query_timeline: "查询时间线",
  reschedule_item: "重新安排日程",
  save_memory: "保存记忆",
  schedule_plan: "计划排期",
  weekly_review: "本周回顾",
};

export const collectionLabelMap: Record<string, string> = {
  "agent-memories": "记忆",
  "agent-runs": "执行记录",
  "agent-threads": "会话",
  checklists: "清单",
  pages: "页面",
  "plan-reviews": "计划复盘",
  plans: "计划",
  posts: "文章",
  "schedule-items": "日程",
  "timeline-events": "时间线",
};

export function formatAgentRoleLabel(role: string) {
  return agentRoleLabelMap[role as keyof typeof agentRoleLabelMap] ?? "任务";
}

export function formatCollectionLabel(collection: string) {
  return collectionLabelMap[collection] ?? collection;
}

export function formatIntentLabel(intent: string) {
  return intentLabelMap[intent] ?? intent;
}

export function formatPriorityLabel(priority: string | null | undefined) {
  return priority ? priorityLabelMap[priority as keyof typeof priorityLabelMap] ?? priority : "未指定";
}

export function formatRunStepLevelLabel(level: string) {
  return runStepLevelLabelMap[level] ?? level;
}
