"use client";

import { useMemo } from "react";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage } from "@/lib/agent/schemas";

type ContextCardProps = {
  threadId: null | number;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  threadTitle?: string;
  tokenCountStr?: string;
  onViewDetail?: () => void;
  onRefresh?: () => void;
  onAddContext?: () => void;
};

export function ContextCard({
  threadId,
  messages,
  traceSteps,
  tokenUsage,
  threadTitle,
  tokenCountStr,
  onViewDetail,
  onRefresh,
  onAddContext,
}: ContextCardProps) {
  /* Summary: latest assistant message, first 3 lines */
  const summary = useMemo(() => {
    const assistantMsgs = [...messages].reverse().filter(
      (m) => m.role === "assistant" && m.content.trim().length > 0
    );
    if (!assistantMsgs.length) return "尚未有对话内容";
    const raw = assistantMsgs[0].content.trim();
    return raw.split("\n").filter(Boolean).slice(0, 3).join("\n");
  }, [messages]);

  /* Referenced counts: parse from traceSteps context detail */
  const refs = useMemo(() => {
    const contextStep = traceSteps.find(
      (s) => s.kind === "context" && s.status === "done"
    );
    if (!contextStep?.detail) return { plans: 0, files: 0, memories: 0 };
    const detail = contextStep.detail;
    const planMatch = detail.match(/(\d+) 条计划/);
    const fileMatch = detail.match(/(\d+) 条内容/);
    const memMatch = detail.match(/(\d+) 条记忆/);
    return {
      plans: planMatch ? Number(planMatch[1]) : 0,
      files: fileMatch ? Number(fileMatch[1]) : 0,
      memories: memMatch ? Number(memMatch[1]) : 0,
    };
  }, [traceSteps]);

  const contextTokensFmt = (() => {
    const k = Math.round(tokenUsage.contextTokens / 100) / 10;
    return `${k}k tokens`;
  })();

  return (
    <div className="sunny-dashboard-right-card">
      <div className="sunny-dashboard-right-card-header">
        <h3 className="sunny-dashboard-right-card-title">当前上下文</h3>
      </div>

      <div className="sunny-context-card-rows">
        <span className="sunny-context-card-label">当前项目</span>
        <span className="sunny-context-card-value">SunnyPanel</span>

        <span className="sunny-context-card-label">当前会话</span>
        <span className="sunny-context-card-value">
          {threadTitle || (threadId ? `会话 #${threadId}` : "新任务")}
        </span>
      </div>

      <p className="sunny-context-card-summary">{summary}</p>

      <div className="sunny-context-ref-section">
        <p className="sunny-context-ref-label">已引用</p>
        <div className="sunny-context-ref-chips">
          <span className="sunny-context-ref-chip">📋 计划 {refs.plans}</span>
          <span className="sunny-context-ref-chip">📄 文件 {refs.files}</span>
          <span className="sunny-context-ref-chip">🧠 记忆 {refs.memories}</span>
          <span className="sunny-context-ref-chip">📊 上下文 {contextTokensFmt}</span>
        </div>
      </div>

      <div className="sunny-context-card-actions">
        <button type="button" className="sunny-context-card-action-btn is-primary" onClick={onViewDetail}>
          查看详情
        </button>
        <button type="button" className="sunny-context-card-action-btn" onClick={onRefresh}>
          刷新上下文
        </button>
        <button type="button" className="sunny-context-card-action-btn" title="添加上下文" onClick={onAddContext}>
          +
        </button>
      </div>
    </div>
  );
}
