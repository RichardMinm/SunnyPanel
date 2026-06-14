import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";

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
  inputTokenEstimate: number;
  messages: AgentChatMessage[];
  onToggleExclude: (key: string) => void;
  onTogglePin: (key: string) => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  workbenchMode?: AgentWorkbenchMode | null;
};

export function AgentContextPanel({
  contextPreferences,
  debugMode,
  inputTokenEstimate,
  messages,
  onToggleExclude,
  onTogglePin,
  pendingAction,
  statusLabel,
  threadId,
  tokenUsage,
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

  // Connected module detection
  const connectedModules: string[] = [];
  if (planCount > 0) connectedModules.push("计划");
  if (checklistCount > 0) connectedModules.push("清单");
  if (memoryTitles.length > 0) connectedModules.push("记忆库");

  const pendingCount = pendingAction?.type === "await_batch_confirmation"
    ? pendingAction.actions.length
    : pendingAction
      ? 1
      : 0;

  // Context items for debug section
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

      {/* Main context grid — only show when there's actual data */}
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

      {/* Context summary — brief overview in normal mode */}
      {!debugMode ? (
        <div className="sunny-agent-context-notes-v2">
          {hasContextRead ? (
            <p>{contextDetail || "已为本轮对话读取相关上下文。"}</p>
          ) : (
            <p>发送任务后，这里会展示本轮对话的上下文摘要。</p>
          )}
        </div>
      ) : null}

      {/* Debug section — collapsible, only visible in debug mode */}
      {debugMode ? (
        <details className="sunny-agent-debug-details" open>
          <summary>调试信息</summary>
          <div className="sunny-agent-debug-details-body">
            <div className="sunny-agent-context-grid-v2">
              <span>Thread ID</span>
              <strong>{threadId ? `#${threadId}` : "新任务"}</strong>
              <span>消息数</span>
              <strong>{messages.length}</strong>
              <span>状态</span>
              <strong>{statusLabel}</strong>
              <span>待确认数</span>
              <strong>{String(pendingCount)}</strong>
            </div>

            <div className="sunny-agent-context-metric-strip sunny-agent-debug-only">
              <div><strong>{String(pendingCount)}</strong><span>待确认</span></div>
              <div><strong>{hasContextRead ? String(planCount) : "—"}</strong><span>引用计划</span></div>
              <div><strong>{hasContextRead ? String(checklistCount) : "—"}</strong><span>引用清单</span></div>
              <div><strong>{hasContextRead ? String(memoryTitles.length) : "—"}</strong><span>命中记忆</span></div>
            </div>

            <div className="sunny-agent-debug-token-info">
              <span>上下文 tokens: {tokenUsage.contextTokens}</span>
              <span>输入 tokens: {inputTokenEstimate}</span>
              <span>输出 tokens: {tokenUsage.outputTokens}</span>
              <span>总计 tokens: {tokenUsage.totalTokens}</span>
            </div>

            {contextItems.length > 0 ? (
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
            ) : null}

            {contextSteps.length > 0 ? (
              <div className="sunny-agent-context-notes-v2" style={{ marginTop: "0.5rem" }}>
                {contextSteps.map((step) => <p key={step.id}>{step.detail ?? step.title}</p>)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
