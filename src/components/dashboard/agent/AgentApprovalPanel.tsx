"use client";

import type { ProposedAgentAction, PendingAction } from "@/lib/agent/schemas";
import { riskLevelLabelMap } from "./constants";

type AgentApprovalPanelProps = {
  action: null | ProposedAgentAction;
  pendingAction: null | PendingAction;
};

export function AgentApprovalPanel({ action, pendingAction }: AgentApprovalPanelProps) {
  if (!pendingAction && !action) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <p>暂无待审批操作</p>
        <p className="mt-1 text-xs">Agent 执行写入操作前会在此显示审批卡片</p>
      </div>
    );
  }

  const approvalActions = pendingAction?.type === "await_batch_confirmation"
    ? pendingAction.actions
    : action ? [action] : [];

  if (approvalActions.length === 0 && !pendingAction) {
    return (
      <div className="p-4 text-sm text-muted">
        <p>Agent 当前没有待确认的操作。执行模式下的写操作会自动生成 DryRun 卡片。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">
        待审批 ({approvalActions.length})
      </p>
      {approvalActions.map((act) => (
        <div key={act.id ?? act.summary} className="rounded-lg border border-border/60 bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              {act.toolName ?? act.intent}
            </span>
            <span className={`text-xs font-semibold ${
              act.riskLevel === "high" ? "text-red-500" :
              act.riskLevel === "medium" ? "text-amber-500" : "text-green-500"
            }`}>
              {riskLevelLabelMap[act.riskLevel]}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{act.summary}</p>
          {act.changes.length > 0 ? (
            <div className="space-y-1">
              {act.changes.slice(0, 5).map((change, i) => (
                <p key={i} className="text-xs text-muted">
                  {change.operation === "create" ? "创建" : change.operation === "update" ? "更新" : "删除"}
                  {" "}{change.collection}
                  {change.documentId ? ` #${change.documentId}` : ""}
                  {change.preview ? ` — ${change.preview}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {pendingAction?.type === "await_confirmation" ? (
        <p className="text-xs text-muted">
          回复「确认」执行，或「取消」放弃。也可以修改请求内容。
        </p>
      ) : null}
    </div>
  );
}
