"use client";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import type { AgentThreadSummary, AgentRunSummary } from "@/components/dashboard/agent/types";
import { ContextCard } from "./ContextCard";
import { PendingActionsCard } from "./PendingActionsCard";
import { HistoryCard } from "./HistoryCard";

type DashboardRightPanelProps = {
  /* Context */
  threadId: null | number;
  threadTitle?: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  tokenCountStr?: string;

  /* Pending */
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;

  /* History */
  threads: AgentThreadSummary[];
  recentRuns: AgentRunSummary[];
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;
};

export function DashboardRightPanel(props: DashboardRightPanelProps) {
  return (
    <aside className="sunny-dashboard-right-panel" aria-label="右侧面板">
      <ContextCard
        threadId={props.threadId}
        threadTitle={props.threadTitle}
        messages={props.messages}
        traceSteps={props.traceSteps}
        tokenUsage={props.tokenUsage}
        tokenCountStr={props.tokenCountStr}
      />
      <PendingActionsCard
        pendingAction={props.pendingAction}
        suggestions={props.suggestions}
        quickPrompts={props.quickPrompts}
        onRunSuggestion={props.onRunSuggestion}
        onRunPrompt={props.onRunPrompt}
        onCancelApproval={props.onCancelApproval}
        onConfirmApproval={props.onConfirmApproval}
      />
      <HistoryCard
        threads={props.threads}
        threadId={props.threadId}
        recentRuns={props.recentRuns}
        traceSteps={props.traceSteps}
        onLoadThread={props.onLoadThread}
        onSelectRun={props.onSelectRun}
      />
    </aside>
  );
}
