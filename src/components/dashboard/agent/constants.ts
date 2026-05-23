import type { AgentTraceStep } from "@/lib/agent/schemas";

import type { AgentInspectorTab, AgentWorkbenchMode } from "./types";

export const modeItems: Array<{ key: AgentWorkbenchMode; label: string }> = [
  { key: "ask", label: "问答" },
  { key: "plan", label: "规划" },
  { key: "execute", label: "执行" },
  { key: "review", label: "复盘" },
  { key: "timeline", label: "时间线" },
];

export const inspectorTabs: Array<{ key: AgentInspectorTab; label: string }> = [
  { key: "context", label: "上下文" },
  { key: "changes", label: "变更" },
  { key: "artifacts", label: "产物" },
  { key: "memory", label: "记忆" },
  { key: "dag", label: "任务图" },
  { key: "debug", label: "调试" },
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
  clarify: "澄清问题",
  complete_plan_item: "完成计划项",
  compose_plan: "创建计划",
  compose_schedule_item: "安排日程",
  compose_timeline_event: "记录时间线",
  create_plan: "新建计划",
  query_plan_progress: "查询进度",
  reschedule_item: "重新安排日程",
  save_memory: "保存记忆",
  schedule_plan: "计划排期",
  weekly_review: "本周回顾",
};
