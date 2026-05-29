import type { AgentChatMessage, ProposedAgentAction } from "@/lib/agent/schemas";
import { isRollbackPayloadExecutable, parseRollbackPayload } from "@/lib/agent/rollback-parse";

import { intentLabelMap } from "./constants";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";

type AgentArtifactsPanelProps = {
  action: null | ProposedAgentAction;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackPayload?: null | unknown;
  onRollback?: () => void;
};

const rollbackStrategyLabel: Record<string, string> = {
  delete_created_document: "删除刚创建的文档",
  delete_created_timeline_event: "删除刚创建的时间线节点",
  restore_checklist_groups: "恢复清单快照（尚未自动支持）",
};

export function AgentArtifactsPanel({
  action,
  artifactsRollbackBusy = false,
  artifactsRollbackError = null,
  latestAssistantMessage,
  lastRollbackPayload = null,
  onRollback,
}: AgentArtifactsPanelProps) {
  const pendingRollback = action?.rollbackPayload;
  const parsedPending = pendingRollback ? parseRollbackPayload(pendingRollback) : null;
  const parsedLast = lastRollbackPayload ? parseRollbackPayload(lastRollbackPayload) : null;
  const canUndoLast = Boolean(lastRollbackPayload && isRollbackPayloadExecutable(lastRollbackPayload));
  const showPendingRollbackNote = Boolean(pendingRollback && action && !canUndoLast);

  if (!action && !latestAssistantMessage && !lastRollbackPayload) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无产物</h3>
        <p>Agent 的总结、Timeline 提案和写入结果会在完成后沉淀到这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {action ? (
        <div className="sunny-agent-artifact-row">
          <span>{intentLabelMap[action.intent] ?? action.intent}</span>
          <strong>{action.summary}</strong>
          <p>{action.changes[0]?.preview ?? "等待确认后执行。"}</p>
        </div>
      ) : null}

      {showPendingRollbackNote && parsedPending ? (
        <div className="sunny-agent-artifact-row sunny-agent-artifact-rollback-hint" role="status">
          <span>回滚预案</span>
          <strong>回滚预案（确认执行后可用）</strong>
          <p>
            {rollbackStrategyLabel[parsedPending.strategy] ?? parsedPending.strategy}
            {parsedPending.target?.collection ? ` · ${parsedPending.target.collection}` : ""}
            {parsedPending.reason ? ` — ${parsedPending.reason}` : ""}
          </p>
        </div>
      ) : null}

      {latestAssistantMessage ? (
        <div className="sunny-agent-artifact-row">
          <span>助手回复</span>
          <strong>最近结果</strong>
          <AgentMarkdownBubble content={latestAssistantMessage.content} />
        </div>
      ) : null}

      {canUndoLast && parsedLast && onRollback ? (
        <div className="sunny-agent-artifact-row sunny-agent-artifact-rollback-action">
          <span>撤销</span>
          <strong>撤销上一轮写入</strong>
          <p>
            {rollbackStrategyLabel[parsedLast.strategy] ?? parsedLast.strategy}
            {parsedLast.target?.collection && typeof parsedLast.target.documentId === "number"
              ? ` · ${parsedLast.target.collection} #${parsedLast.target.documentId}`
              : ""}
          </p>
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
