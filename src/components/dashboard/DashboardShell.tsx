"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage, PendingAction } from "@/lib/agent/schemas";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { AppShell } from "./AppShell";
import type { DashboardIconMode } from "./DashboardIconBar";
import { DashboardModeProvider } from "./DashboardModeContext";
import { DashboardRightPanel } from "./DashboardRightPanel";
import { DashboardStatusBar } from "./DashboardStatusBar";
import { MainWorkspace } from "./MainWorkspace";
import { SidebarNav } from "./SidebarNav";

type DashboardShellProps = {
  children: ReactNode;
  /* Right panel */
  threadTitle?: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
  /* Slide panel data */
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
  /* Status bar data */
  tokenCount?: string;
};

export function DashboardShell({
  threadTitle,
  messages,
  traceSteps,
  tokenUsage,
  onCancelApproval,
  onConfirmApproval,
  children,
  onLoadThread,
  onNewThread,
  onSelectRun,
  onRunPrompt,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  suggestions,
  threadId,
  threads,
  tokenCount,
}: DashboardShellProps) {
  const [activeMode, setActiveMode] = useState<DashboardIconMode>("agent");
  const [panelOpen, setPanelOpen] = useState(true);

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

  return (
    <AppShell panelOpen={panelOpen}>
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

      <MainWorkspace>
        <DashboardModeProvider value={activeMode}>
          {children}
        </DashboardModeProvider>
      </MainWorkspace>

      <DashboardRightPanel
        panelOpen={panelOpen}
        threadId={threadId}
        threadTitle={threadTitle}
        messages={messages}
        traceSteps={traceSteps}
        tokenUsage={tokenUsage}
        tokenCountStr={tokenCount}
        pendingAction={pendingAction}
        suggestions={suggestions}
        quickPrompts={quickPrompts}
        onRunSuggestion={onRunSuggestion}
        onRunPrompt={onRunPrompt}
        onCancelApproval={onCancelApproval}
        onConfirmApproval={onConfirmApproval}
        threads={threads}
        recentRuns={recentRuns}
        onLoadThread={onLoadThread}
        onSelectRun={onSelectRun}
      />

      <DashboardStatusBar
        statusLabel={statusLabel}
        tokenCount={tokenCount}
      />
    </AppShell>
  );
}
