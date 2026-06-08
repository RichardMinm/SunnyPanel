"use client";

import { useCallback } from "react";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { AgentWorkbench } from "@/components/dashboard/agent";
import { useAgentDashboardChat } from "@/components/dashboard/agent-chat/use-agent-dashboard-chat";
import { DashboardShell } from "./DashboardShell";

export type DashboardPageClientProps = {
  initialThreadId?: number;
  initialSuggestions: AgentInboxSuggestion[];
};

export function DashboardPageClient({
  initialThreadId,
  initialSuggestions,
}: DashboardPageClientProps) {
  const chat = useAgentDashboardChat({ initialThreadId });

  const handleArchiveThread = useCallback(
    async (id: number) => {
      return chat.archiveThread(id, true);
    },
    [chat],
  );

  const handleDeleteThread = useCallback(
    async (id: number) => {
      return chat.deleteThread(id);
    },
    [chat],
  );

  const handleArchiveCurrentThread = useCallback(() => {
    const currentId = chat.threadId;
    if (currentId === null) return;
    void chat.archiveThread(currentId, true).then((ok) => {
      if (ok) {
        chat.clearRunDetail();
        chat.resetThread();
      }
    });
  }, [chat]);

  return (
    <DashboardShell
      activeInspectorTab={chat.activeInspectorTab}
      artifactsRollbackBusy={chat.artifactsRollbackBusy}
      artifactsRollbackError={chat.artifactsRollbackError}
      contextPreferences={chat.contextPreferences}
      initialSuggestions={initialSuggestions}
      isSubmitting={chat.isSubmitting}
      inputTokenEstimate={chat.inputTokenEstimate}
      lastRollbackPayload={chat.lastRollbackPayload}
      lastRollbackResult={chat.lastRollbackResult}
      messages={chat.messages}
      traceSteps={chat.traceSteps}
      tokenUsage={chat.tokenUsage}
      onArchiveThread={handleArchiveThread}
      onDeleteThread={handleDeleteThread}
      onArtifactsRollback={chat.runArtifactsRollback}
      onInspectorTabChange={chat.setActiveInspectorTab}
      onLoadThread={(nextThreadId) => { void chat.loadThread(nextThreadId); }}
      onNewThread={() => { chat.clearRunDetail(); chat.resetThread(); }}
      onRollbackSelectedRun={chat.rollbackSelectedRun}
      onRunPrompt={(prompt) => { chat.clearRunDetail(); void chat.sendMessage(prompt); }}
      onToggleContextExclude={chat.toggleContextExclude}
      onToggleContextPin={chat.toggleContextPin}
      onWorkbenchModeChange={chat.setWorkbenchMode}
      pendingAction={chat.pendingAction}
      selectedRunDetail={chat.selectedRunDetail}
      selectedRunRollbackBusy={chat.selectedRunRollbackBusy}
      selectedRunRollbackError={chat.selectedRunRollbackError}
      statusLabel={chat.statusLabel}
      threadId={chat.threadId}
      threads={chat.threads}
      workbenchMode={chat.workbenchMode}
    >
      <AgentWorkbench
        errorMessage={chat.errorMessage}
        input={chat.input}
        isSubmitting={chat.isSubmitting}
        isThinking={chat.isThinking}
        messages={chat.messages}
        onArchiveThread={handleArchiveCurrentThread}
        onCancelApproval={() => { chat.clearRunDetail(); chat.cancelApproval(); }}
        onEditApproval={chat.editApproval}
        onRenameThread={chat.renameThread}
        onConfirmApproval={() => { chat.clearRunDetail(); chat.confirmApproval(); }}
        onInputChange={chat.setInput}
        onStop={chat.stopGeneration}
        onSubmit={() => { chat.clearRunDetail(); void chat.sendMessage(chat.input); }}
        onWorkbenchModeChange={chat.setWorkbenchMode}
        pendingAction={chat.pendingAction}
        statusLabel={chat.statusLabel}
        streamChanges={chat.streamChanges}
        streamProgress={chat.streamProgress}
        streamStages={chat.streamStages}
        thinkingContent={chat.thinkingContent}
        threadId={chat.threadId}
        threadTitle={chat.threadTitle}
        traceSteps={chat.traceSteps}
        transcriptRef={chat.transcriptRef}
        workbenchMode={chat.workbenchMode}
      />
    </DashboardShell>
  );
}
