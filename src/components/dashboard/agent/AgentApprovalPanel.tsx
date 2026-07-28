import type { PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";

import { AgentChangesPanel } from "./AgentChangesPanel";
import { isPlanConfirmationAction } from "./PlanConfirmationCard";
import { formatAgentRoleLabel, formatIntentLabel, riskLevelLabelMap } from "./constants";
import { getPendingActionLabel } from "./utils";

type AgentApprovalPanelProps = {
  action: null | ProposedAgentAction;
  pendingAction: null | PendingAction;
};

export function AgentApprovalPanel({ action, pendingAction }: AgentApprovalPanelProps) {
  const planConfirmationAction =
    pendingAction?.type === "await_confirmation" && isPlanConfirmationAction(pendingAction.action)
      ? pendingAction.action
      : null;

  if (planConfirmationAction) {
    const rollbackStatus =
      planConfirmationAction.rollbackAvailable ? "可回滚" : "不可回滚";

    return (
      <div className="sunny-agent-inspector-panel sunny-agent-pending-inspector-summary">
        <div className="sunny-agent-inspector-summary">
          <h3>当前操作</h3>
          <p>创建计划 · 等待确认</p>
        </div>
        <div className="sunny-agent-pending-inspector-rows">
          <div>
            <span>风险</span>
            <strong>{riskLevelLabelMap[planConfirmationAction.riskLevel]}</strong>
            <p>原因：将写入数据库</p>
          </div>
          <div>
            <span>影响范围</span>
            <strong>新增 1 项计划</strong>
            <p>{rollbackStatus}</p>
          </div>
          <div>
            <span>上下文</span>
            <strong>来源：计划草案</strong>
            <p>状态：等待用户确认</p>
          </div>
        </div>
        <p className="sunny-agent-pending-inspector-alert" role="status">
          当前操作尚未执行，确认后才会创建计划。
        </p>
      </div>
    );
  }

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

  if (pendingAction?.type === "await_strategy_resume") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-medium">策略恢复</span>
          <h3>{getPendingActionLabel(pendingAction)}</h3>
          <p>失败原因：{pendingAction.failureReason}</p>
          <p>策略模式：{pendingAction.strategyMode}</p>
          {pendingAction.failedTaskId ? <p>失败任务：{pendingAction.failedTaskId}</p> : null}
          <p>回复「继续」按策略恢复，或回复「取消」放弃这次恢复。</p>
        </div>
        <div className="sunny-agent-change-list-v2">
          {pendingAction.tasks.map((task) => (
            <div key={task.id} className="sunny-agent-change-row">
              <div>
                <span>{formatIntentLabel(task.intent)}</span>
                <strong>{task.label}</strong>
              </div>
              <p>
                {formatAgentRoleLabel(task.agentRole)}
                {task.id === pendingAction.failedTaskId ? " · 失败任务" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pendingAction?.type === "await_learning_followup") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">需要确认</span>
          <h3>是否保存为学习计划</h3>
          <p>{pendingAction.subject}</p>
        </div>
      </div>
    );
  }

  return <AgentChangesPanel action={action} />;
}
