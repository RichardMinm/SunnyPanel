"use client";

import { useEffect, useState } from "react";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppCard } from "@/components/primitives/AppCard";
import { AppSection } from "@/components/primitives/AppSection";
import type { AgentOpsSnapshot } from "@/lib/agent/ops/snapshot";

type AgentOpsPanelProps = {
  limit?: number;
  snapshot?: AgentOpsSnapshot;
};

const emptySnapshot: AgentOpsSnapshot = {
  failures: [],
  pendingActions: [],
  recentReceipts: [],
  recentRuns: [],
  summary: {
    failureCount: 0,
    pendingCount: 0,
    receiptsCount: 0,
    runsCount: 0,
  },
};

const formatDate = (value?: string) => value ? value.replace("T", " ").slice(0, 16) : "未知时间";
const formatDuration = (value?: null | number) => value === null || value === undefined ? "未知耗时" : `${value}ms`;
const formatTokens = (value?: null | number) => value === null || value === undefined ? "未知 tokens" : `${value} tokens`;

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="sunny-agent-ops-summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="sunny-agent-ops-empty">{children}</p>;
}

export function AgentOpsPanel({ limit = 20, snapshot: providedSnapshot }: AgentOpsPanelProps) {
  const [loadedSnapshot, setLoadedSnapshot] = useState<AgentOpsSnapshot | null>(null);
  const [error, setError] = useState<null | string>(null);
  const [loading, setLoading] = useState(!providedSnapshot);

  useEffect(() => {
    if (providedSnapshot) {
      return;
    }

    let cancelled = false;

    async function loadOpsSnapshot() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/agent/ops?limit=${limit}`);

        if (!response.ok) {
          throw new Error("无法读取 Agent Ops 数据");
        }

        const data = (await response.json()) as AgentOpsSnapshot;

        if (!cancelled) {
          setLoadedSnapshot(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "无法读取 Agent Ops 数据");
          setLoadedSnapshot(emptySnapshot);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOpsSnapshot();

    return () => {
      cancelled = true;
    };
  }, [limit, providedSnapshot]);

  const data = providedSnapshot ?? loadedSnapshot ?? emptySnapshot;

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-ops-panel">
      <div className="sunny-agent-inspector-summary">
        <span>Agent Ops</span>
        <h3>运行与写操作状态</h3>
        <p>只读查看最近 AgentRun、receipt、pending confirmation 和失败状态。</p>
      </div>

      {loading ? <p className="sunny-agent-inspector-hint">正在读取 Agent Ops 数据...</p> : null}
      {error ? <p className="sunny-agent-ops-error" role="status">{error}</p> : null}

      <div className="sunny-agent-ops-summary-grid">
        <SummaryTile label="Runs" value={data.summary.runsCount} />
        <SummaryTile label="Receipts" value={data.summary.receiptsCount} />
        <SummaryTile label="Pending" value={data.summary.pendingCount} />
        <SummaryTile label="Failures" value={data.summary.failureCount} />
      </div>

      <AppSection title="Recent Runs">
        {data.recentRuns.length === 0 ? (
          <EmptyState>暂无 AgentRun。</EmptyState>
        ) : (
          <ul className="sunny-agent-ops-list">
            {data.recentRuns.map((run) => (
              <li key={run.id}>
                <AppCard padding="sm" variant="quiet">
                  <div className="sunny-agent-ops-row-head">
                    <strong>{run.intent ?? "unknown"}</strong>
                    <AppBadge tone={run.status === "failed" ? "danger" : "muted"}>{run.status ?? "unknown"}</AppBadge>
                  </div>
                  <p>{run.model ?? "未记录模型"} · {formatTokens(run.totalTokens)} · {formatDuration(run.durationMs)}</p>
                  <small>{formatDate(run.createdAt)}</small>
                </AppCard>
              </li>
            ))}
          </ul>
        )}
      </AppSection>

      <AppSection title="Recent Receipts">
        {data.recentReceipts.length === 0 ? (
          <EmptyState>暂无 receipt。</EmptyState>
        ) : (
          <ul className="sunny-agent-ops-list">
            {data.recentReceipts.map((receipt) => (
              <li key={receipt.id}>
                <AppCard padding="sm" variant="quiet">
                  <div className="sunny-agent-ops-row-head">
                    <strong>{receipt.operation ?? "execute"}</strong>
                    <AppBadge tone={receipt.status === "failed" || receipt.status === "indeterminate" ? "danger" : "muted"}>
                      {receipt.status ?? "unknown"}
                    </AppBadge>
                  </div>
                  <p>{receipt.actionId ?? "未知 actionId"}</p>
                  <small>thread #{receipt.threadId ?? "?"} · {formatDate(receipt.createdAt)}</small>
                </AppCard>
              </li>
            ))}
          </ul>
        )}
      </AppSection>

      <AppSection title="Pending Confirmations">
        {data.pendingActions.length === 0 ? (
          <EmptyState>暂无待确认操作。</EmptyState>
        ) : (
          <ul className="sunny-agent-ops-list">
            {data.pendingActions.map((pending) => (
              <li key={`${pending.threadId}-${pending.actionId ?? "pending"}`}>
                <AppCard padding="sm" variant="quiet">
                  <div className="sunny-agent-ops-row-head">
                    <strong>{pending.intent ?? "unknown"}</strong>
                    <AppBadge tone="warning">等待确认</AppBadge>
                  </div>
                  <p>{pending.actionId ?? "未知 actionId"}</p>
                  <small>thread #{pending.threadId} · {formatDate(pending.createdAt)}</small>
                </AppCard>
              </li>
            ))}
          </ul>
        )}
      </AppSection>

      <AppSection title="Failures">
        {data.failures.length === 0 ? (
          <EmptyState>暂无失败或不确定动作。</EmptyState>
        ) : (
          <ul className="sunny-agent-ops-list">
            {data.failures.map((failure, index) => (
              <li key={`${failure.source}-${failure.createdAt ?? index}`}>
                <AppCard padding="sm" variant="quiet">
                  <div className="sunny-agent-ops-row-head">
                    <strong>{failure.source}</strong>
                    <AppBadge tone="danger">需要查看</AppBadge>
                  </div>
                  <p>{failure.message}</p>
                  <small>{formatDate(failure.createdAt)}</small>
                </AppCard>
              </li>
            ))}
          </ul>
        )}
      </AppSection>
    </div>
  );
}
