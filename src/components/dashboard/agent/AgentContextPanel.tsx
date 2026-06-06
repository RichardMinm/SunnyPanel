import type { AgentChatMessage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";

import type { ContextPreferences } from "./types";
import { getPendingActionLabel } from "./utils";

type ContextItemRowProps = {
  contextPreferences: ContextPreferences;
  itemKey: string;
  label: string;
  onToggleExclude: (key: string) => void;
  onTogglePin: (key: string) => void;
};

function ContextItemRow({ contextPreferences, itemKey, label, onToggleExclude, onTogglePin }: ContextItemRowProps) {
  const isPinned = contextPreferences.pinned.includes(itemKey);
  const isExcluded = contextPreferences.excluded.includes(itemKey);

  return (
    <div className="sunny-agent-context-item-row">
      <span className={`sunny-agent-context-item-label${isExcluded ? " is-excluded" : ""}`}>{label}</span>
      <div className="sunny-agent-context-item-actions">
        <button
          type="button"
          className={`sunny-agent-context-pin-btn${isPinned ? " is-active" : ""}`}
          title={isPinned ? "取消置顶" : "置顶此项"}
          aria-pressed={isPinned}
          onClick={() => onTogglePin(itemKey)}
        >
          置顶
        </button>
        <button
          type="button"
          className={`sunny-agent-context-exclude-btn${isExcluded ? " is-active" : ""}`}
          title={isExcluded ? "取消排除" : "排除此项"}
          aria-pressed={isExcluded}
          onClick={() => onToggleExclude(itemKey)}
        >
          排除
        </button>
      </div>
    </div>
  );
}

type AgentContextPanelProps = {
  contextPreferences: ContextPreferences;
  debugMode: boolean;
  messages: AgentChatMessage[];
  onToggleExclude: (key: string) => void;
  onTogglePin: (key: string) => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  traceSteps: AgentTraceStep[];
};

export function AgentContextPanel({
  contextPreferences,
  debugMode,
  messages,
  onToggleExclude,
  onTogglePin,
  pendingAction,
  statusLabel,
  threadId,
  traceSteps,
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
  const pendingCount = pendingAction?.type === "await_batch_confirmation"
    ? pendingAction.actions.length
    : pendingAction
      ? 1
      : 0;
  const metricItems = [
    { label: "待确认", value: String(pendingCount) },
    { label: "引用计划", value: hasContextRead ? String(planCount) : "—" },
    { label: "引用清单", value: hasContextRead ? String(checklistCount) : "—" },
    { label: "命中记忆", value: hasContextRead ? String(memoryTitles.length) : "—" },
  ];

  const contextItems: { key: string; label: string }[] = [];

  if (planCount > 0) {
    contextItems.push({ key: "plans:referenced", label: `已引用 ${planCount} 条计划（详情见记录）` });
  }

  if (checklistCount > 0) {
    contextItems.push({ key: "checklists:referenced", label: `已引用 ${checklistCount} 份清单（详情见记录）` });
  }

  for (const title of memoryTitles) {
    contextItems.push({ key: `memory:${title}`, label: `记忆：${title}` });
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {debugMode ? (
        <div className="sunny-agent-context-metric-strip sunny-agent-debug-only">
          {metricItems.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="sunny-agent-context-grid-v2">
        <span>线程</span>
        <strong>{threadId ? `#${threadId}` : "新任务"}</strong>
        <span>消息</span>
        <strong>{messages.length}</strong>
        <span>状态</span>
        <strong>{statusLabel}</strong>
        <span>待办</span>
        <strong>{pendingAction ? getPendingActionLabel(pendingAction) : "无"}</strong>
      </div>
      {debugMode && contextItems.length > 0 ? (
        <div className="sunny-agent-context-items-list sunny-agent-debug-only">
          <p className="sunny-agent-context-items-hint">点击「置顶」或「排除」调整下一轮上下文偏好（仅当前会话有效）</p>
          {contextItems.map((item) => (
            <ContextItemRow
              key={item.key}
              contextPreferences={contextPreferences}
              itemKey={item.key}
              label={item.label}
              onToggleExclude={onToggleExclude}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      ) : debugMode ? (
        <div className="sunny-agent-context-notes-v2">
          {contextSteps.length > 0 ? (
            contextSteps.map((step) => <p key={step.id}>{step.detail ?? step.title}</p>)
          ) : (
            <p>发送任务后，Agent 读取的计划、内容、Timeline 和执行摘要会在这里出现。</p>
          )}
        </div>
      ) : (
        <div className="sunny-agent-context-notes-v2">
          <p>{contextSteps.length > 0 ? "已为本轮对话读取相关上下文。" : "发送任务后，这里会展示本轮对话的上下文摘要。"}</p>
        </div>
      )}
    </div>
  );
}
