import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import { AgentTaskRow } from "./AgentTaskRow";
import type { AgentRunSummary, AgentThreadSummary } from "./types";
import { buildSuggestedTasks, getPendingActionLabel } from "./utils";

type AgentSidebarProps = {
  disabled?: boolean;
  inboxSuggestions: AgentInboxSuggestion[];
  isThinking: boolean;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function AgentSidebar({
  disabled,
  inboxSuggestions,
  isThinking,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  threadId,
  threads,
}: AgentSidebarProps) {
  const tasks = buildSuggestedTasks(inboxSuggestions, quickPrompts).slice(0, 5);
  const pendingTone = pendingAction?.type === "await_confirmation"
    ? pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success"
    : "warning";

  return (
    <aside className="sunny-agent-left-rail">
      <div className="sunny-agent-rail-head">
        <button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
          New Task
        </button>
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Active</p>
        <AgentTaskRow
          detail={isThinking ? "running" : "ready"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Approvals</p>
        {pendingAction ? (
          <AgentTaskRow
            detail={getPendingActionLabel(pendingAction)}
            label={pendingAction.type === "await_confirmation" ? pendingAction.action.summary : "需要继续输入"}
            meta="待处理"
            tone={pendingTone}
          />
        ) : (
          <AgentTaskRow detail="没有待确认动作" label="Clear" tone="muted" />
        )}
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Suggestions</p>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "Run"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }

                onRunPrompt(task.prompt);
              }}
              tone={task.riskLevel === "high" ? "danger" : task.riskLevel === "medium" ? "warning" : "accent"}
            />
          ))
        ) : (
          <AgentTaskRow detail="输入一个目标即可开始" label="暂无建议" tone="muted" />
        )}
      </div>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>Threads</summary>
        <div className="sunny-agent-rail-detail-list">
          {threads.slice(0, 5).map((thread) => (
            <AgentTaskRow
              key={thread.id}
              detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
              label={`Thread #${thread.id}`}
              onClick={() => onLoadThread(thread.id)}
              selected={thread.id === threadId}
              tone={thread.pendingAction ? "warning" : "muted"}
            />
          ))}
          {threads.length === 0 ? <AgentTaskRow detail="还没有历史会话" label="No threads" tone="muted" /> : null}
        </div>
      </details>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>Recent AgentRuns</summary>
        <div className="sunny-agent-rail-detail-list">
          {recentRuns.slice(0, 4).map((run) => (
            <AgentTaskRow
              key={run.id}
              detail={run.summary ?? run.workflow}
              label={run.title}
              meta={run.status}
              tone={run.status === "failed" ? "danger" : run.status === "succeeded" ? "success" : "info"}
            />
          ))}
          {recentRuns.length === 0 ? <AgentTaskRow detail="还没有审计记录" label="No runs" tone="muted" /> : null}
        </div>
      </details>
    </aside>
  );
}
