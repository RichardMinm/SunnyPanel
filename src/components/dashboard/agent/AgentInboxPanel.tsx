"use client";

import { useCallback } from "react";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import { useAgentInbox } from "./use-agent-inbox";

type AgentInboxPanelProps = {
  onPrefillComposer?: (prompt: string) => void;
};

export function AgentInboxPanel({ onPrefillComposer }: AgentInboxPanelProps) {
  const { accept, dismiss, error, isLoading, items } = useAgentInbox();

  const handleAccept = useCallback(
    (item: AgentInboxSuggestion) => {
      // accept = 预填 composer（用户复核后再经安全门发起），并标记建议已接受。
      onPrefillComposer?.(item.suggestedPrompt);
      void accept(item.id);
    },
    [accept, onPrefillComposer],
  );

  if (isLoading) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-inbox-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>正在读取建议…</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-inbox-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂时读不到建议</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-inbox-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂无待办建议</h3>
          <p>当 Agent 发现逾期计划、待补时间线或发布后可联动的内容时，会在这里给出下一步。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-inbox-panel">
      <div className="sunny-agent-inspector-summary">
        <span>Agent 主动建议</span>
        <h3>{items.length} 条待处理</h3>
      </div>
      <ul className="sunny-agent-inbox-list">
        {items.map((item) => (
          <li className="sunny-agent-inbox-card" key={item.id}>
            <div className="sunny-agent-inbox-card-head">
              <span className={`sunny-agent-inbox-risk is-${item.riskLevel}`}>
                {riskLevelLabelMap[item.riskLevel]}
              </span>
              <h4>{item.title}</h4>
            </div>
            <p className="sunny-agent-inbox-reason">{item.reason}</p>
            <div className="sunny-agent-inbox-actions">
              <button
                type="button"
                className="sunny-agent-inbox-accept"
                onClick={() => handleAccept(item)}
                title="把建议填进对话框，复核后再发起"
              >
                采纳
              </button>
              <button
                type="button"
                className="sunny-agent-inbox-dismiss"
                onClick={() => void dismiss(item.id)}
                title="忽略（7 天内不再出现）"
              >
                忽略
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
