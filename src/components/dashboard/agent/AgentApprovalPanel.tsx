import type { PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";

import { AgentChangesPanel } from "./AgentChangesPanel";
import { formatAgentRoleLabel, formatIntentLabel, riskLevelLabelMap } from "./constants";
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
                <span>{riskLevelLabelMap[item.riskLevel]}</span>
                <strong>{item.summary}</strong>
              </div>
              <p>{item.changes[0]?.preview ?? formatIntentLabel(item.intent)}</p>
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

  if (pendingAction?.type === "await_queue_resume") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">等待继续</span>
          <h3>{getPendingActionLabel(pendingAction)}</h3>
          <p>回复「继续」恢复延后队列，或回复「取消」放弃这条待执行队列。</p>
        </div>
        <div className="sunny-agent-change-list-v2">
          {pendingAction.tasks
            .filter((task) => pendingAction.deferredTaskIds.includes(task.id))
            .map((task) => (
              <div key={task.id} className="sunny-agent-change-row">
                <div>
                  <span>{formatIntentLabel(task.intent)}</span>
                  <strong>{task.label}</strong>
                </div>
                <p>{formatAgentRoleLabel(task.agentRole)}</p>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return <AgentChangesPanel action={action} />;
}
