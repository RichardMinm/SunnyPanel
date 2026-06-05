"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { AppShell } from "./AppShell";
import type { DashboardIconMode } from "./DashboardIconBar";
import { DashboardModeProvider } from "./DashboardModeContext";
import { DashboardStatusBar } from "./DashboardStatusBar";
import { MainWorkspace } from "./MainWorkspace";
import { RightContextPanel } from "./RightContextPanel";
import { SidebarNav } from "./SidebarNav";

type DashboardShellProps = {
  children: ReactNode;
  /* Slide panel data */
  isThinking: boolean;
  messages: AgentChatMessage[];
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onSearchThreads?: (query: string) => void;
  onSelectRun?: (runId: number) => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  selectedRunId?: null | number;
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
  /* Status bar data */
  tokenCount?: string;
};

export function DashboardShell({
  children,
  isThinking,
  messages,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onSearchThreads,
  onSelectRun,
  onRunPrompt,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  selectedRunId,
  statusLabel,
  suggestions,
  threadId,
  threads,
  tokenCount,
}: DashboardShellProps) {
  const [activeMode, setActiveMode] = useState<DashboardIconMode>("agent");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(344);
  const [isPanelResizing, setIsPanelResizing] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncPanelForViewport = () => {
      setPanelOpen(!mediaQuery.matches);
    };

    syncPanelForViewport();
    mediaQuery.addEventListener("change", syncPanelForViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncPanelForViewport);
    };
  }, []);

  const handleModeChange = useCallback(
    (_mode: DashboardIconMode, prompt: string) => {
      setActiveMode(_mode);
      if (prompt) {
        onRunPrompt(prompt);
      }
    },
    [onRunPrompt],
  );

  const handleTogglePanel = useCallback(() => {
    setPanelOpen((v) => !v);
  }, []);

  const handlePanelResizeStart = useCallback(() => {
    setIsPanelResizing(true);
  }, []);

  useEffect(() => {
    if (!isPanelResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = window.innerWidth - event.clientX - 16;
      setPanelWidth(Math.min(360, Math.max(320, nextWidth)));
    };

    const handlePointerUp = () => {
      setIsPanelResizing(false);
    };

    document.body.classList.add("sunny-dashboard-is-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.classList.remove("sunny-dashboard-is-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isPanelResizing]);

  return (
    <AppShell panelOpen={panelOpen} panelWidth={panelWidth}>
      <SidebarNav
        activeMode={activeMode}
        onLoadThread={onLoadThread}
        onModeChange={handleModeChange}
        onNewThread={onNewThread}
        onTogglePanel={handleTogglePanel}
        panelOpen={panelOpen}
        threadId={threadId}
        threads={threads}
      />

      <RightContextPanel
        disabled={isThinking}
        isThinking={isThinking}
        messages={messages}
        onArchiveThread={onArchiveThread}
        onLoadThread={onLoadThread}
        onNewThread={onNewThread}
        onRunPrompt={onRunPrompt}
        onResizeStart={handlePanelResizeStart}
        onSearchThreads={onSearchThreads}
        onSelectRun={onSelectRun}
        onRunSuggestion={onRunSuggestion}
        pendingAction={pendingAction}
        quickPrompts={quickPrompts}
        recentRuns={recentRuns}
        selectedRunId={selectedRunId}
        statusLabel={statusLabel}
        suggestions={suggestions}
        threadId={threadId}
        threads={threads}
      />

      <MainWorkspace>
        <DashboardModeProvider value={activeMode}>
          {children}
        </DashboardModeProvider>
      </MainWorkspace>

      <DashboardStatusBar
        statusLabel={statusLabel}
        tokenCount={tokenCount}
      />
    </AppShell>
  );
}
