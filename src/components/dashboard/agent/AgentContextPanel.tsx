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
  const memoryMatch = contextDetail.match(/(\d+) 条长期记忆/);
  const memoryTitlesMatch = contextDetail.match(/命中记忆：(.+)/);
  const planCount = planMatch ? Number(planMatch[1]) : 0;
  const checklistCount = checklistMatch ? Number(checklistMatch[1]) : 0;
  const memoryTitles = memoryTitlesMatch
    ? memoryTitlesMatch[1].split("、").filter(Boolean)
    : [];

  const contextItems: { key: string; label: string }[] = [];

  for (let i = 0; i < planCount; i++) {
    contextItems.push({ key: `plan:${i}`, label: `计划 #${i + 1}` });
  }

  for (let i = 0; i < checklistCount; i++) {
    contextItems.push({ key: `checklist:${i}`, label: `清单 #${i + 1}` });
  }

  for (const title of memoryTitles) {
    contextItems.push({ key: `memory:${title}`, label: `记忆：${title}` });
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {/* Action-oriented metrics — backend provides actual counts */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-amber-500">0</p>
          <p className="text-xs text-muted">待确认</p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-blue-500">0</p>
          <p className="text-xs text-muted">今日日程</p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-green-500">0</p>
          <p className="text-xs text-muted">进行中计划</p>
        </div>
        <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-purple-500">0</p>
          <p className="text-xs text-muted">未完成任务</p>
        </div>
      </div>
      <div className="sunny-agent-context-grid-v2">
        <span>Thread</span>
        <strong>{threadId ? `#${threadId}` : "新任务"}</strong>
        <span>Messages</span>
        <strong>{messages.length}</strong>
        <span>Status</span>
        <strong>{statusLabel}</strong>
        <span>Pending</span>
        <strong>{pendingAction ? getPendingActionLabel(pendingAction) : "无"}</strong>
      </div>
      {contextItems.length > 0 ? (
        <div className="sunny-agent-context-items-list">
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
      ) : (
        <div className="sunny-agent-context-notes-v2">
          {contextSteps.length > 0 ? (
            contextSteps.map((step) => <p key={step.id}>{step.detail ?? step.title}</p>)
          ) : (
            <p>发送任务后，Agent 读取的计划、内容、Timeline 和 AgentRun 摘要会在这里出现。</p>
          )}
        </div>
      )}
    </div>
  );
}
