import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentTraceStep, PendingAction } from "@/lib/agent/schemas";

import { getPendingActionLabel } from "./utils";

type AgentContextPanelProps = {
  pendingAction: null | PendingAction;
  statusLabel: string;
  traceSteps: AgentTraceStep[];
  workbenchMode?: AgentWorkbenchMode | null;
};

export function AgentContextPanel({
  pendingAction,
  statusLabel: _statusLabel,
  traceSteps,
  workbenchMode,
}: AgentContextPanelProps) {
  const contextSteps = traceSteps.filter((step) => step.kind === "context");
  const contextDetail = contextSteps.find((step) => step.id === "context-bootstrap" && step.status === "done")?.detail ?? "";
  const planMatch = contextDetail.match(/(\d+) 条计划/);
  const checklistMatch = contextDetail.match(/(\d+) 份清单/);
  const memoryTitlesMatch = contextDetail.match(/命中记忆：(.+)/);
  const planCount = planMatch ? Number(planMatch[1]) : 0;
  const checklistCount = checklistMatch ? Number(checklistMatch[1]) : 0;
  const memoryTitles = memoryTitlesMatch
    ? memoryTitlesMatch[1].split("、").filter(Boolean)
    : [];
  const hasContextRead = contextSteps.length > 0;
  const linkedCount = planCount + checklistCount + memoryTitles.length;
  const hasAnyData = hasContextRead && linkedCount > 0;

  const connectedModules: string[] = [];
  if (planCount > 0) connectedModules.push("计划");
  if (checklistCount > 0) connectedModules.push("清单");
  if (memoryTitles.length > 0) connectedModules.push("记忆库");

  const modeLabel = workbenchMode === "today" ? "今日"
    : workbenchMode === "writing" ? "写作"
    : workbenchMode === "plan" || workbenchMode === "execute" ? "计划"
    : workbenchMode === "review" ? "回顾"
    : workbenchMode === "timeline" ? "时间线"
    : null;

  return (
    <div className="sunny-agent-inspector-panel">
      {modeLabel ? (
        <span className="sunny-mode-badge" data-mode={workbenchMode ?? "agent"}>
          {modeLabel}模式
        </span>
      ) : null}

      {hasAnyData ? (
        <div className="sunny-agent-context-grid-v2">
          <span>当前项目</span>
          <strong>SunnyPanel</strong>
          <span>可用模块</span>
          <strong>{connectedModules.length > 0 ? connectedModules.join("、") : "暂无"}</strong>
          <span>关联内容</span>
          <strong>{linkedCount > 0 ? `${linkedCount} 项` : "暂无"}</strong>
          <span>待确认操作</span>
          <strong>{pendingAction ? getPendingActionLabel(pendingAction) : "无"}</strong>
        </div>
      ) : (
        <div className="sunny-agent-context-empty">
          <p>暂无关联上下文</p>
          <small>当你询问计划、日程或清单时，相关内容会出现在这里。</small>
        </div>
      )}

      <div className="sunny-agent-context-notes-v2">
        {hasContextRead ? (
          <p>{contextDetail || "已为本轮对话读取相关上下文。"}</p>
        ) : (
          <p>发送任务后，这里会展示本轮对话的上下文摘要。</p>
        )}
      </div>
    </div>
  );
}
