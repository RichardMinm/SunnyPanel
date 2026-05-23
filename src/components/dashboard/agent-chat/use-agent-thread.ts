"use client";

import { useCallback, useState } from "react";

import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";

export type LoadedThread = {
  id: number;
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
  title: string;
};

export function useAgentThreadList() {
  const [threadId, setThreadId] = useState<null | number>(null);
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRunSummary[]>([]);

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

    if (data.selectedThread) {
      setThreadId(data.selectedThread.id);
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

  return {
    archiveThread,
    fetchThread,
    recentRuns,
    searchThreads,
    setThreadId,
    threadId,
    threads,
  };
}
