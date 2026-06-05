"use client";

import { useState } from "react";
import type { AgentThreadSummary, AgentRunSummary } from "@/components/dashboard/agent/types";
import type { AgentTraceStep } from "@/lib/agent/schemas";

type HistoryCardTab = "sessions" | "executions";

type HistoryCardProps = {
  threads: AgentThreadSummary[];
  threadId: null | number;
  recentRuns: AgentRunSummary[];
  traceSteps: AgentTraceStep[];
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;
};

const runStatusMap: Record<string, { label: string; icon: string }> = {
  succeeded: { label: "成功", icon: "✅" },
  failed: { label: "失败", icon: "❌" },
  running: { label: "执行中", icon: "🔄" },
  pending: { label: "排队", icon: "⏳" },
  queued: { label: "排队", icon: "⏳" },
  done: { label: "完成", icon: "✅" },
  error: { label: "错误", icon: "❌" },
};

export function HistoryCard({
  threads,
  threadId,
  recentRuns,
  traceSteps,
  onLoadThread,
  onSelectRun,
}: HistoryCardProps) {
  const [tab, setTab] = useState<HistoryCardTab>("sessions");

  return (
    <div className="sunny-dashboard-right-card">
      {/* Tabs */}
      <div className="sunny-history-card-tabs" role="tablist" aria-label="历史视图切换">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sessions"}
          className={`sunny-history-card-tab${tab === "sessions" ? " is-active" : ""}`}
          onClick={() => setTab("sessions")}
        >
          会话历史
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "executions"}
          className={`sunny-history-card-tab${tab === "executions" ? " is-active" : ""}`}
          onClick={() => setTab("executions")}
        >
          执行记录
        </button>
      </div>

      {/* Tab: Sessions */}
      {tab === "sessions" ? (
        <div className="sunny-history-card-list">
          {threads.slice(0, 10).map((thread) => (
            <div
              key={thread.id}
              className={`sunny-history-session-row${thread.id === threadId ? " is-active" : ""}`}
              onClick={() => onLoadThread(thread.id)}
            >
              <div className="sunny-history-session-title">
                {thread.title || `会话 #${thread.id}`}
              </div>
              <div className="sunny-history-session-meta">
                {thread.archived ? "已归档 · " : ""}Thread #{thread.id}
                {thread.tags?.length ? ` · ${thread.tags.join(", ")}` : ""}
              </div>
            </div>
          ))}
          {threads.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", padding: "8px 10px" }}>
              暂无会话历史
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Tab: Executions */}
      {tab === "executions" ? (
        <div className="sunny-history-card-list">
          {/* Live trace steps first */}
          {traceSteps
            .filter((s) => s.kind === "action" || s.kind === "write")
            .slice(0, 6)
            .map((step) => {
              const status = runStatusMap[step.status] || { label: step.status, icon: "•" };
              return (
                <div key={step.id} className="sunny-history-exec-row">
                  <span className="sunny-history-exec-status" title={status.label}>
                    {status.icon}
                  </span>
                  <span className="sunny-history-exec-name">{step.title}</span>
                </div>
              );
            })}
          {/* Then recent runs */}
          {recentRuns.slice(0, 6).map((run) => {
            const status = runStatusMap[run.status] || { label: run.status, icon: "•" };
            return (
              <div
                key={run.id}
                className="sunny-history-exec-row"
                onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
                style={onSelectRun ? { cursor: "pointer" } : undefined}
              >
                <span className="sunny-history-exec-status" title={status.label}>
                  {status.icon}
                </span>
                <span className="sunny-history-exec-name">{run.title}</span>
                <span className="sunny-history-exec-time">
                  {run.runKind === "rollback" ? "回滚" : run.runKind === "review" ? "复盘" : ""}
                </span>
              </div>
            );
          })}
          {traceSteps.filter((s) => s.kind === "action" || s.kind === "write").length === 0 &&
           recentRuns.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", padding: "8px 10px" }}>
              暂无执行记录
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
