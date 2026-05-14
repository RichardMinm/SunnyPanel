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
