import type { AgentChatMessage, AgentTraceStep, ProposedAgentAction } from "@/lib/agent/schemas";
import { canRollbackAgentRunDetail, formatAgentRunRollbackAction } from "@/lib/agent/run-summary";

import { AgentArtifactsPanel } from "./AgentArtifactsPanel";
import { formatRunStepLevelLabel, traceKindLabelMap, traceStatusLabelMap } from "./constants";
import {
  buildRollbackResultDisplayRows,
  formatRollbackResultStatus,
  type AgentRollbackExecutionResult,
} from "./rollback-display";
import type { AgentRunDetail } from "./types";

type AgentTracePanelProps = {
  action: null | ProposedAgentAction;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackPayload?: null | unknown;
  debugMode: boolean;
  onArtifactsRollback?: () => void;
  onRollbackSelectedRun?: () => void;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  traceSteps: AgentTraceStep[];
};

function RollbackResultCard({ result }: { result: AgentRollbackExecutionResult }) {
  const rows = buildRollbackResultDisplayRows(result);

  return (
    <div className="sunny-agent-artifact-row sunny-agent-artifact-rollback-action" role="status">
      <span>撤销</span>
      <strong>{formatRollbackResultStatus(result)}</strong>
      <p>{result.summary ?? "最近一次写入已经完成撤销。"}</p>
      {rows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={`${row.detail}:${row.operationLabel}`} className="rounded-md border border-border/60 px-3 py-2 text-xs text-muted">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="mx-2 text-muted">/</span>
              <span>{row.operationLabel}</span>
              <small className="mt-1 block text-[11px] text-muted">{row.detail}</small>
            </li>
          ))}
        </ul>
      ) : null}
      {result.auditWarning ? <p className="mt-2 text-xs text-warning">审计提示：{result.auditWarning}</p> : null}
    </div>
  );
}

function AgentRunDetailCard({
  debugMode,
  onRollback,
  rollbackBusy,
  rollbackError,
  run,
}: {
  debugMode: boolean;
  onRollback?: () => void;
  rollbackBusy?: boolean;
  rollbackError?: null | string;
  run: AgentRunDetail;
}) {
  const canRollback = canRollbackAgentRunDetail(run);

  return (
    <div className="sunny-agent-artifact-row" role="status">
      <span>{run.runKind === "rollback" ? "撤销记录" : run.runKind === "review" ? "复盘记录" : "执行记录"}</span>
      <strong>{run.title}</strong>
      {run.impactSummary ? <p>{run.impactSummary}</p> : null}
      {run.summary ? <p>{run.summary}</p> : null}
      {run.goal ? (
        <p>
          <span className="font-medium text-foreground">目标：</span>
          {run.goal}
        </p>
      ) : null}
      {run.nextAction ? (
        <p>
          <span className="font-medium text-foreground">下一步：</span>
          {run.nextAction}
        </p>
      ) : null}
      {debugMode && run.steps.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {run.steps.slice(0, 6).map((step, index) => (
            <li key={`${step.recordedAt ?? "step"}:${index}`} className="rounded-md border border-border/60 px-3 py-2 text-xs text-muted">
              <span className="font-medium text-foreground">{formatRunStepLevelLabel(step.level)}</span>
              <small className="ml-2">{step.recordedAt ?? "未记录时间"}</small>
              <p className="mt-1">{step.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {canRollback && onRollback ? (
        <button
          type="button"
          className="sunny-gap-action-secondary mt-3 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={rollbackBusy}
          onClick={onRollback}
        >
          {rollbackBusy ? "正在撤销..." : formatAgentRunRollbackAction(run)}
        </button>
      ) : null}
      {rollbackError ? (
        <div className="sunny-agent-error-card-v2 mt-2" role="alert">
          {rollbackError}
        </div>
      ) : null}
    </div>
  );
}

export function AgentTracePanel({
  action,
  artifactsRollbackBusy = false,
  artifactsRollbackError = null,
  lastRollbackResult = null,
  latestAssistantMessage,
  lastRollbackPayload = null,
  debugMode,
  onArtifactsRollback,
  onRollbackSelectedRun,
  selectedRunDetail = null,
  selectedRunRollbackBusy = false,
  selectedRunRollbackError = null,
  statusLabel,
  traceSteps,
}: AgentTracePanelProps) {
  const hasArtifacts = Boolean(action || latestAssistantMessage || lastRollbackPayload);
  const showDebugTrace = debugMode;

  if (traceSteps.length === 0 && !hasArtifacts && !lastRollbackResult && !selectedRunDetail) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>等待执行详情</h3>
        <p>{statusLabel || "发送消息后，这里会展示本轮执行结果和必要过程。"}</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {hasArtifacts ? (
        <AgentArtifactsPanel
          action={action}
          artifactsRollbackBusy={artifactsRollbackBusy}
          artifactsRollbackError={artifactsRollbackError}
          latestAssistantMessage={latestAssistantMessage}
          lastRollbackPayload={lastRollbackPayload}
          onRollback={onArtifactsRollback}
        />
      ) : null}
      {selectedRunDetail ? (
        <AgentRunDetailCard
          debugMode={debugMode}
          onRollback={onRollbackSelectedRun}
          rollbackBusy={selectedRunRollbackBusy}
          rollbackError={selectedRunRollbackError}
          run={selectedRunDetail}
        />
      ) : null}
      {lastRollbackResult ? <RollbackResultCard result={lastRollbackResult} /> : null}
      {traceSteps.length > 0 ? (
        <div className="sunny-agent-trace-panel-list">
          {traceSteps.map((step) => (
            <div key={step.id} className={`sunny-agent-run-step-v2 sunny-agent-run-step-v2-${step.status}`}>
              <span className="sunny-agent-run-step-marker" aria-hidden="true" />
              <div className="sunny-agent-run-step-content">
                {showDebugTrace ? (
                  <div className="sunny-agent-debug-only">
                    <span className={`sunny-agent-kind-pill sunny-agent-kind-${step.kind}`}>{traceKindLabelMap[step.kind]}</span>
                    <small>{traceStatusLabelMap[step.status]}</small>
                  </div>
                ) : null}
                <h3>{step.title}</h3>
                {showDebugTrace && step.detail ? <p className="sunny-agent-debug-only">{step.detail}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
