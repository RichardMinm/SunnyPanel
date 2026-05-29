import type { AgentTraceStep } from "@/lib/agent/schemas";

import type { AgentInspectorTab, AgentWorkbenchMode } from "./types";

export const modeItems: Array<{ description: string; key: AgentWorkbenchMode; label: string }> = [
  { key: "ask", label: "只回答", description: "不写入数据库，只回答当前问题" },
  { key: "plan", label: "生成建议", description: "生成计划或内容建议，默认不执行" },
  { key: "execute", label: "可执行", description: "允许进入 DryRun 和确认流程" },
  { key: "review", label: "复盘", description: "汇总进展和下一步" },
  { key: "timeline", label: "时间线", description: "整理长期记录和节点" },
];

export const inspectorTabs: Array<{ key: AgentInspectorTab; label: string }> = [
  { key: "context", label: "Context" },
  { key: "approval", label: "Approval" },
  { key: "trace", label: "Trace" },
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
