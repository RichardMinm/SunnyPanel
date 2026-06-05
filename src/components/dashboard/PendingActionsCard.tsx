"use client";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { riskLevelLabelMap } from "@/components/dashboard/agent/constants";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

type PendingActionsCardProps = {
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
};

export function PendingActionsCard({
  pendingAction,
  suggestions,
  quickPrompts,
  onRunSuggestion,
  onRunPrompt,
  onCancelApproval,
  onConfirmApproval,
}: PendingActionsCardProps) {
  /* Merge suggestions + quickPrompts into unified action list */
  const actions = [
    ...suggestions.slice(0, 4).map((s) => ({
      id: `sug-${s.id}`,
      title: s.title,
      description: s.reason,
      riskLevel: (s.riskLevel || "low") as "high" | "low" | "medium",
      suggestion: s,
      isQuick: false,
    })),
    ...quickPrompts.slice(0, 2).map((p) => ({
      id: `quick-${p.label}`,
      title: p.label,
      description: p.prompt,
      riskLevel: "low" as const,
      suggestion: null,
      isQuick: true,
    })),
  ];

  const count = actions.length;
  const hasOverflow = count > 3;

  const riskClass = (level: string) =>
    level === "high" ? "high" : level === "medium" ? "medium" : "low";

  return (
    <div className="sunny-dashboard-right-card">
      <div className="sunny-dashboard-right-card-header">
        <h3 className="sunny-dashboard-right-card-title">待处理事项</h3>
        {count > 0 ? (
          <span className="sunny-dashboard-right-card-badge">{count}</span>
        ) : null}
      </div>

      {/* Action Cards */}
      {actions.length > 0 ? (
        <div className={`sunny-pending-actions-list${hasOverflow ? " has-overflow" : ""}`}>
          {actions.map((action) => (
            <div key={action.id} className="sunny-action-card">
              <div className="sunny-action-card-head">
                <span className={`sunny-action-card-dot ${riskClass(action.riskLevel)}`} />
                <span className="sunny-action-card-title">{action.title}</span>
              </div>
              <p className="sunny-action-card-desc">{action.description}</p>
              <div className="sunny-action-card-meta">
                <span className={`sunny-action-card-risk ${riskClass(action.riskLevel)}`}>
                  {riskLevelLabelMap[action.riskLevel]}
                </span>
              </div>
              <div className="sunny-action-card-btns">
                <button
                  type="button"
                  className="sunny-action-card-btn is-accept"
                  onClick={() => {
                    if (action.suggestion) onRunSuggestion(action.suggestion);
                    else onRunPrompt(action.description);
                  }}
                >
                  采纳
                </button>
                <button type="button" className="sunny-action-card-btn is-dismiss">
                  忽略
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="sunny-context-card-summary" style={{ margin: 0 }}>
          暂无待处理建议
        </p>
      )}

      {/* Risk Warning — from pending confirmation action */}
      {pendingAction?.type === "await_confirmation" ? (
        <div className="sunny-risk-warning">
          <p className="sunny-risk-warning-label">风险提醒</p>
          <p style={{ fontSize: "0.6875rem", color: "var(--muted)", marginBottom: 4 }}>
            等级: {riskLevelLabelMap[pendingAction.action.riskLevel]} · 来源: {pendingAction.action.intent}
          </p>
          <p className="sunny-risk-warning-desc">{pendingAction.action.summary}</p>
          <div className="sunny-action-card-btns">
            <button type="button" className="sunny-action-card-btn is-accept" onClick={onConfirmApproval}>
              处理
            </button>
            <button type="button" className="sunny-action-card-btn">稍后</button>
            <button type="button" className="sunny-action-card-btn is-dismiss" onClick={onCancelApproval}>
              忽略
            </button>
          </div>
        </div>
      ) : pendingAction?.type === "await_batch_confirmation" ? (
        <div className="sunny-risk-warning">
          <p className="sunny-risk-warning-label">风险提醒</p>
          <p style={{ fontSize: "0.6875rem", color: "var(--muted)", marginBottom: 4 }}>
            批量确认 · {pendingAction.actions.length} 项操作
          </p>
          <p className="sunny-risk-warning-desc">{getPendingActionLabel(pendingAction)}</p>
          <div className="sunny-action-card-btns">
            <button type="button" className="sunny-action-card-btn is-accept" onClick={onConfirmApproval}>
              处理
            </button>
            <button type="button" className="sunny-action-card-btn is-dismiss" onClick={onCancelApproval}>
              忽略
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
