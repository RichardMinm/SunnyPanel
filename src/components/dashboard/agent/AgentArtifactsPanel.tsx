import type { AgentChatMessage, ProposedAgentAction } from "@/lib/agent/schemas";

import { formatIntentLabel } from "./constants";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";

type AgentArtifactsPanelProps = {
  action: null | ProposedAgentAction;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackSourceRunId?: null | number;
  onRollback?: () => void;
};

export function AgentArtifactsPanel({
  action,
  artifactsRollbackBusy = false,
  artifactsRollbackError = null,
  latestAssistantMessage,
  lastRollbackSourceRunId = null,
  onRollback,
}: AgentArtifactsPanelProps) {
  const canUndoLast = Boolean(lastRollbackSourceRunId);
  const showPendingRollbackNote = Boolean(action?.rollbackAvailable && !canUndoLast);

  if (!action && !latestAssistantMessage && !lastRollbackSourceRunId) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无产物</h3>
        <p>写入结果、Timeline 提案和执行摘要会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {action ? (
        <div className="sunny-agent-artifact-row">
          <span>{formatIntentLabel(action.intent)}</span>
          <strong>{action.summary}</strong>
          <p>{action.changes[0]?.preview ?? "等待确认后执行。"}</p>
        </div>
      ) : null}

      {showPendingRollbackNote ? (
        <div className="sunny-agent-artifact-row sunny-agent-artifact-rollback-hint" role="status">
          <span>回滚预案</span>
          <strong>回滚预案（确认执行后可用）</strong>
          <p>确认执行后，系统会根据服务端保存的执行记录提供受控撤销。</p>
        </div>
      ) : null}

      {latestAssistantMessage ? (
        <div className="sunny-agent-artifact-row">
          <span>助手回复</span>
          <strong>最近结果</strong>
          <AgentMarkdownBubble content={latestAssistantMessage.content} />
        </div>
      ) : null}

      {canUndoLast && onRollback ? (
        <div className="sunny-agent-artifact-row sunny-agent-artifact-rollback-action">
          <span>撤销</span>
          <strong>撤销上一轮写入</strong>
          <p>撤销将使用服务端保存的执行记录，不会从浏览器提交可执行数据。</p>
          <button
            type="button"
            className="sunny-gap-action-secondary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={artifactsRollbackBusy}
            onClick={onRollback}
          >
            {artifactsRollbackBusy ? "正在撤销…" : "执行撤销"}
          </button>
        </div>
      ) : null}

      {artifactsRollbackError ? (
        <div className="sunny-agent-error-card-v2 mt-2" role="alert">
          {artifactsRollbackError}
        </div>
      ) : null}
    </div>
  );
}
