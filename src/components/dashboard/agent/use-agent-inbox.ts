"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

type InboxState = {
  error: null | string;
  isLoading: boolean;
  items: AgentInboxSuggestion[];
};

const SUGGESTIONS_ENDPOINT = "/api/agent/suggestions";

/**
 * 轻量数据 hook：读取 GET /api/agent/suggestions，并对 accept/dismiss 走 PATCH。
 * 行动后从本地列表乐观移除，dismiss 复用后端既有的 7 天冷却（不会立刻重现）。
 */
export function useAgentInbox() {
  const [state, setState] = useState<InboxState>({ error: null, isLoading: true, items: [] });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    try {
      const response = await fetch(SUGGESTIONS_ENDPOINT, { method: "GET" });
      const body = (await response.json().catch(() => null)) as null | {
        message?: string;
        suggestions?: AgentInboxSuggestion[];
      };

      if (!response.ok) {
        throw new Error(body?.message ?? "读取 Agent 建议失败");
      }

      setState({ error: null, isLoading: false, items: body?.suggestions ?? [] });
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : "读取 Agent 建议失败",
        isLoading: false,
        items: [],
      });
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initial inbox fetch toggles loading then hydrates from the API */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const act = useCallback(async (id: number, action: "accept" | "dismiss") => {
    setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));

    try {
      await fetch(SUGGESTIONS_ENDPOINT, {
        body: JSON.stringify({ action, id }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
    } catch {
      // 行动写入失败时静默降级：下次刷新会重新拉取真实状态。
    }
  }, []);

  const accept = useCallback((id: number) => act(id, "accept"), [act]);
  const dismiss = useCallback((id: number) => act(id, "dismiss"), [act]);

  return {
    accept,
    dismiss,
    error: state.error,
    isLoading: state.isLoading,
    items: state.items,
    refresh,
  };
}
