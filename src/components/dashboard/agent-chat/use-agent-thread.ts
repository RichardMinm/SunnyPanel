"use client";

import { useCallback, useState } from "react";

import type { AgentRunDetail, AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";

export type LoadedThread = {
  id: number;
  lastInteractionAt?: string;
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
  title: string;
};

export function useAgentThreadList() {
  const [lastInteractionAt, setLastInteractionAt] = useState<null | string>(null);
  const [threadId, setThreadId] = useState<null | number>(null);
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRunSummary[]>([]);
  const [runDetailError, setRunDetailError] = useState<null | string>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AgentRunDetail | null>(null);

  const fetchThread = useCallback(async (nextThreadId?: number) => {
    const response = await fetch(nextThreadId ? `/api/agent/thread?threadId=${nextThreadId}` : "/api/agent/thread", {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      selectedThread?: LoadedThread | null;
      recentRuns?: AgentRunSummary[];
      threads?: AgentThreadSummary[];
    };

    setThreads(data.threads ?? []);
    setRecentRuns(data.recentRuns ?? []);
    setRunDetailError(null);
    setSelectedRunDetail(null);

    if (data.selectedThread) {
      setThreadId(data.selectedThread.id);
      setLastInteractionAt(data.selectedThread.lastInteractionAt ?? null);
    }

    return data.selectedThread ?? null;
  }, []);

  const searchThreads = useCallback(async (query: string) => {
    try {
      const params = new URLSearchParams();

      if (query) params.set("q", query);

      params.set("limit", "20");

      const response = await fetch(`/api/agent/thread?${params.toString()}`);

      if (!response.ok) return;

      const data = (await response.json()) as { threads?: AgentThreadSummary[] };

      if (data.threads) setThreads(data.threads);
    } catch {
      // ignore search errors
    }
  }, []);

  const archiveThread = useCallback(async (archiveThreadId: number, archived: boolean) => {
    const response = await fetch("/api/agent/thread", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: archiveThreadId, archived }),
    });

    if (!response.ok) {
      return false;
    }

    setThreads((current) => current.map((t) => (t.id === archiveThreadId ? { ...t, archived } : t)));

    return true;
  }, []);

  const clearRunDetail = useCallback(() => {
    setRunDetailError(null);
    setSelectedRunDetail(null);
  }, []);

  const fetchRunDetail = useCallback(async (runId: number) => {
    setRunDetailError(null);

    const response = await fetch(`/api/agent/run?runId=${runId}`, {
      method: "GET",
    });

    if (!response.ok) {
      setSelectedRunDetail(null);
      setRunDetailError("无法读取执行记录");

      return null;
    }

    const data = (await response.json()) as { run?: AgentRunDetail };
    const run = data.run ?? null;

    setSelectedRunDetail(run);

    return run;
  }, []);

  return {
    archiveThread,
    clearRunDetail,
    fetchThread,
    fetchRunDetail,
    lastInteractionAt,
    recentRuns,
    runDetailError,
    searchThreads,
    selectedRunDetail,
    setThreadId,
    setThreads,
    threadId,
    threads,
  };
}
