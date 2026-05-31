import type { PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";

import { AgentChangesPanel } from "./AgentChangesPanel";
import { getPendingActionLabel } from "./utils";

type AgentApprovalPanelProps = {
  action: null | ProposedAgentAction;
  pendingAction: null | PendingAction;
};

export function AgentApprovalPanel({ action, pendingAction }: AgentApprovalPanelProps) {
  if (pendingAction?.type === "await_batch_confirmation") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-medium">批量确认</span>
          <h3>{getPendingActionLabel(pendingAction)}</h3>
          <p>这些操作会在用户确认后按顺序执行。</p>
        </div>
        <div className="sunny-agent-change-list-v2">
          {pendingAction.actions.map((item) => (
            <div key={item.id} className="sunny-agent-change-row">
              <div>
                <span>{item.riskLevel}</span>
                <strong>{item.summary}</strong>
              </div>
              <p>{item.changes[0]?.preview ?? item.toolName ?? item.intent}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pendingAction?.type === "await_clarification") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">等待澄清</span>
          <h3>{pendingAction.question}</h3>
          <p>{pendingAction.missingFields.join(" / ") || pendingAction.intent}</p>
        </div>
      </div>
    );
  }

  if (pendingAction?.type === "await_completion_note") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">等待备注</span>
          <h3>{pendingAction.itemTitle}</h3>
          <p>{pendingAction.checklistTitle}</p>
        </div>
      </div>
    );
  }

  return <AgentChangesPanel action={action} />;
}
