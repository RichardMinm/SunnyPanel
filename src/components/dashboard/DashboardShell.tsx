"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { DashboardIconBar, type DashboardIconMode } from "./DashboardIconBar";
import { DashboardModeChips } from "./DashboardModeChips";
import { DashboardSlidePanel } from "./DashboardSlidePanel";
import { DashboardStatusBar } from "./DashboardStatusBar";

type DashboardShellProps = {
  children: ReactNode;
  /* Slide panel data */
  isThinking: boolean;
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
    <div
      className={`sunny-dashboard-shell${!panelOpen ? " is-panel-collapsed" : ""}`}
      data-testid="dashboard-shell"
    >
      {/* Icon bar - always visible */}
      <DashboardIconBar
        activeMode={activeMode}
        onModeChange={handleModeChange}
        onTogglePanel={handleTogglePanel}
        panelOpen={panelOpen}
      />

      {/* Slide panel - conditionally rendered */}
      {panelOpen ? (
        <DashboardSlidePanel
          disabled={isThinking}
          isThinking={isThinking}
          onArchiveThread={onArchiveThread}
          onLoadThread={onLoadThread}
          onNewThread={onNewThread}
          onRunPrompt={onRunPrompt}
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
      ) : null}

      {/* Main content area */}
      <main className="sunny-dashboard-main">
        <DashboardModeChips activeMode={activeMode} onModeChange={handleModeChange} />
        {children}
      </main>

      {/* Status bar */}
      <DashboardStatusBar
        statusLabel={statusLabel}
        tokenCount={tokenCount}
      />
    </div>
  );
}
