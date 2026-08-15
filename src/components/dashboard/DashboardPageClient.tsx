"use client";

import { useCallback, useState } from "react";

import { AgentWorkbench } from "@/components/dashboard/agent";
import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import { useAgentDashboardChat } from "@/components/dashboard/agent-chat/use-agent-dashboard-chat";
import type { DashboardNewThreadOptions } from "@/components/dashboard/sidebar/dashboard-sidebar-types";
import { DashboardShell } from "./DashboardShell";

export type DashboardPageClientProps = {
  initialThreadId?: number;
};

export function DashboardPageClient({
  initialThreadId,
}: DashboardPageClientProps) {
  const chat = useAgentDashboardChat({ initialThreadId });
  const [discardDraftDialogOpen, setDiscardDraftDialogOpen] = useState(false);

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

  const startNewThread = useCallback(() => {
    setDiscardDraftDialogOpen(false);
    chat.clearRunDetail();
    chat.resetThread();
  }, [chat]);

  const handleNewThread = useCallback((options?: DashboardNewThreadOptions) => {
    if (!options?.force && chat.input.trim().length > 0) {
      setDiscardDraftDialogOpen(true);
      return;
    }

    startNewThread();
  }, [chat.input, startNewThread]);

  const continueEditingDraft = useCallback(() => {
    setDiscardDraftDialogOpen(false);
    chat.focusComposer();
  }, [chat]);

  return (
    <>
      <DashboardShell
        activeInspectorTab={chat.activeInspectorTab}
        artifactsRollbackBusy={chat.artifactsRollbackBusy}
        artifactsRollbackError={chat.artifactsRollbackError}
        contextPreferences={chat.contextPreferences}
        isSubmitting={chat.isSubmitting}
        inputTokenEstimate={chat.inputTokenEstimate}
        lastRollbackSourceRunId={chat.lastRollbackSourceRunId}
        lastRollbackResult={chat.lastRollbackResult}
        messages={chat.messages}
        traceSteps={chat.traceSteps}
        turnAudit={chat.turnAudit}
        tokenUsage={chat.tokenUsage}
        onArchiveThread={handleArchiveThread}
        onDeleteThread={handleDeleteThread}
        onArtifactsRollback={chat.runArtifactsRollback}
        onInspectorTabChange={chat.setActiveInspectorTab}
        onPrefillComposer={(prompt, source) => { chat.prefillFromSuggestion(prompt, source); }}
        onLoadThread={(nextThreadId) => { void chat.loadThread(nextThreadId); }}
        onNewThread={handleNewThread}
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
          composerFocusRequestKey={chat.composerFocusRequestKey}
          errorMessage={chat.errorMessage}
          input={chat.input}
          isSubmitting={chat.isSubmitting}
          isThinking={chat.isThinking}
          messages={chat.messages}
          onArchiveThread={handleArchiveCurrentThread}
          onCancelApproval={() => { chat.clearRunDetail(); chat.cancelApproval(); }}
          onEditApproval={chat.editApproval}
          onRenameThread={chat.renameThread}
          onRetryLastMessage={() => { chat.clearRunDetail(); chat.retryLastMessage(); }}
          onConfirmApproval={() => { chat.clearRunDetail(); chat.confirmApproval(); }}
          onInputChange={chat.setInput}
          onSendMessage={(prompt) => { chat.clearRunDetail(); void chat.sendMessage(prompt); }}
          onStop={chat.stopGeneration}
          onSubmit={() => { chat.clearRunDetail(); void chat.sendMessage(chat.input); }}
          pendingAction={chat.pendingAction}
          statusLabel={chat.statusLabel}
          streamChanges={chat.streamChanges}
          streamStages={chat.streamStages}
          threadId={chat.threadId}
          threadTitle={chat.threadTitle}
          traceSteps={chat.traceSteps}
          transcriptRef={chat.transcriptRef}
        />
      </DashboardShell>
      <ConfirmDialog
        cancelLabel="继续编辑"
        confirmLabel="丢弃并新建"
        message="输入框中还有未发送的内容。开始新对话会丢弃这份草稿。"
        onCancel={continueEditingDraft}
        onConfirm={startNewThread}
        open={discardDraftDialogOpen}
        title="丢弃未发送的草稿？"
        variant="warning"
      />
    </>
  );
}
