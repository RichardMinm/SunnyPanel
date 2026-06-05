"use client";

import { AgentWorkbench } from "@/components/dashboard/agent";
import { useAgentDashboardChat } from "@/components/dashboard/agent-chat/use-agent-dashboard-chat";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { DashboardShell } from "./DashboardShell";

export type DashboardPageClientProps = {
  initialThreadId?: number;
  quickPrompts?: AgentQuickPrompt[];
  suggestions?: AgentInboxSuggestion[];
};

export function DashboardPageClient({
  initialThreadId,
  quickPrompts = [],
  suggestions = [],
}: DashboardPageClientProps) {
  const chat = useAgentDashboardChat({ initialThreadId, suggestions });

  return (
    <DashboardShell
      isThinking={chat.isThinking}
      messages={chat.messages}
      traceSteps={chat.traceSteps}
      tokenUsage={chat.tokenUsage}
      threadTitle={chat.threadTitle}
      onCancelApproval={() => { chat.clearRunDetail(); chat.cancelApproval(); }}
      onConfirmApproval={() => { chat.clearRunDetail(); chat.confirmApproval(); }}
      onArchiveThread={chat.archiveThread}
      onLoadThread={(nextThreadId) => { void chat.loadThread(nextThreadId); }}
      onNewThread={() => { chat.clearRunDetail(); chat.resetThread(); }}
      onSearchThreads={chat.searchThreads}
      onSelectRun={(runId) => { void chat.selectRunDetail(runId); }}
      onRunPrompt={(prompt) => { chat.clearRunDetail(); void chat.sendMessage(prompt); }}
      onRunSuggestion={(suggestion) => { chat.clearRunDetail(); void chat.runSuggestion(suggestion); }}
      pendingAction={chat.pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={chat.recentRuns}
      selectedRunId={chat.selectedRunDetail?.id ?? null}
      statusLabel={chat.statusLabel}
      suggestions={chat.inboxSuggestions}
      threadId={chat.threadId}
      threads={chat.threads}
      tokenCount={chat.tokenCountStr}
    >
      <AgentWorkbench
        errorMessage={chat.errorMessage}
        input={chat.input}
        isSubmitting={chat.isSubmitting}
        lastInteractionAt={chat.lastInteractionAt}
        isThinking={chat.isThinking}
        messages={chat.messages}
        onCancelApproval={() => { chat.clearRunDetail(); chat.cancelApproval(); }}
        onEditApproval={chat.editApproval}
        onRenameThread={chat.renameThread}
        onConfirmApproval={() => { chat.clearRunDetail(); chat.confirmApproval(); }}
        onInputChange={chat.setInput}
        onStop={chat.stopGeneration}
        onSubmit={() => { chat.clearRunDetail(); void chat.sendMessage(chat.input); }}
        pendingAction={chat.pendingAction}
        statusLabel={chat.statusLabel}
        thinkingContent={chat.thinkingContent}
        threadId={chat.threadId}
        threadTitle={chat.threadTitle}
        tokenUsage={chat.tokenUsage}
        traceSteps={chat.traceSteps}
        transcriptRef={chat.transcriptRef}
      />
    </DashboardShell>
  );
}
