"use client";

import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";

import { formatCapabilityLabel, getCapabilityPhaseLabel } from "./constants";

type AgentCapabilityAuditPanelProps = {
  turnAudit: AgentTurnTrace | null;
};

const confirmationStateLabelMap: Record<NonNullable<AgentTurnTrace["confirmationState"]>, string> = {
  approved: "已确认",
  auto_approved: "自动通过",
  none: "无",
  pending: "待确认",
  rejected: "已拒绝",
};

export function AgentCapabilityAuditPanel({ turnAudit }: AgentCapabilityAuditPanelProps) {
  if (!turnAudit) {
    return null;
  }

  const allowed = turnAudit.allowedCapabilities ?? [];
  const blocked = turnAudit.blockedCapabilities ?? [];
  const hasAuditContent =
    allowed.length > 0 ||
    blocked.length > 0 ||
    turnAudit.writeRequired !== undefined ||
    turnAudit.resolverResult ||
    turnAudit.policyGuardOutput;

  if (!hasAuditContent) {
    return null;
  }

  return (
    <details className="sunny-agent-capability-audit" open>
      <summary>能力门控审计</summary>
      <div className="sunny-agent-capability-audit-body">
        <div className="sunny-agent-capability-audit-meta">
          {turnAudit.writeRequired !== undefined ? (
            <span>
              写入需求：<strong>{turnAudit.writeRequired ? "是" : "否"}</strong>
            </span>
          ) : null}
          {turnAudit.confirmationState ? (
            <span>
              确认状态：<strong>{confirmationStateLabelMap[turnAudit.confirmationState]}</strong>
            </span>
          ) : null}
          {turnAudit.resolverResult ? (
            <span>
              目标解析：<strong>{turnAudit.resolverResult.status}</strong>
            </span>
          ) : null}
          {turnAudit.riskLevel ? (
            <span>
              风险：<strong>{turnAudit.riskLevel}</strong>
            </span>
          ) : null}
        </div>

        {allowed.length > 0 ? (
          <div className="sunny-agent-capability-audit-group">
            <p>已放行</p>
            <ul className="sunny-agent-capability-chip-list">
              {allowed.map((name) => (
                <li key={name}>
                  <span className={`sunny-agent-capability-chip is-allowed sunny-agent-capability-${getCapabilityPhaseLabel(name)}`}>
                    {formatCapabilityLabel(name)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {blocked.length > 0 ? (
          <div className="sunny-agent-capability-audit-group">
            <p>已拦截</p>
            <ul className="sunny-agent-capability-chip-list">
              {blocked.map((item) => (
                <li key={item.name}>
                  <span
                    className={`sunny-agent-capability-chip is-blocked sunny-agent-capability-${getCapabilityPhaseLabel(item.name)}`}
                    title={item.reason}
                  >
                    {formatCapabilityLabel(item.name)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {turnAudit.plannedTools.length > 0 || turnAudit.actualTools.length > 0 ? (
          <div className="sunny-agent-capability-audit-plan">
            <span>计划：{turnAudit.plannedTools.join(", ") || "—"}</span>
            <span>实际：{turnAudit.actualTools.join(", ") || "—"}</span>
          </div>
        ) : null}
      </div>
    </details>
  );
}
