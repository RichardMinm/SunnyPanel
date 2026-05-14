import type { ProposedAgentAction, ProposedAgentActionChange } from "@/lib/agent/schemas";

import { operationLabelMap, riskLevelLabelMap, visibilityLabelMap } from "./constants";

type AgentChangeCardProps = {
  change: ProposedAgentActionChange;
};

function AgentChangeCard({ change }: AgentChangeCardProps) {
  return (
    <div className={`sunny-agent-change-row sunny-agent-change-row-${change.operation}`}>
      <div>
        <span>{operationLabelMap[change.operation]}</span>
        <strong>{change.documentId ? `${change.collection} #${change.documentId}` : change.collection}</strong>
      </div>
      <p>{change.preview}</p>
      {change.beforePreview || change.afterPreview ? (
        <div className="sunny-agent-diff-inline">
          {change.beforePreview ? <del>{change.beforePreview}</del> : null}
          {change.afterPreview ? <ins>{change.afterPreview}</ins> : null}
        </div>
      ) : null}
      <small>
        {change.visibility ? visibilityLabelMap[change.visibility] : "未知可见性"}
        {change.timelineAffected ? " · 影响 Timeline" : ""}
      </small>
    </div>
  );
}

type AgentChangesPanelProps = {
  action: null | ProposedAgentAction;
};

export function AgentChangesPanel({ action }: AgentChangesPanelProps) {
  if (!action) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无待审变更</h3>
        <p>需要写入计划、清单或 Timeline 时，dry-run 结果会出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-inspector-summary">
        <span className={`sunny-agent-risk-pill-v2 sunny-agent-risk-${action.riskLevel}`}>{riskLevelLabelMap[action.riskLevel]}</span>
        <h3>{action.summary}</h3>
        <p>{action.toolName ?? action.intent}</p>
      </div>
      <div className="sunny-agent-change-list-v2">
        {action.changes.map((change, index) => (
          <AgentChangeCard key={`${change.collection}-${change.operation}-${index}`} change={change} />
        ))}
      </div>
    </div>
  );
}
