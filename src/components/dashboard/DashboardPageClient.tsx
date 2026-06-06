"use client";

import { AgentWorkbench } from "@/components/dashboard/agent";
import { useAgentDashboardChat } from "@/components/dashboard/agent-chat/use-agent-dashboard-chat";
import { DashboardShell } from "./DashboardShell";

export type DashboardPageClientProps = {
  initialThreadId?: number;
};

export function DashboardPageClient({
  initialThreadId,
}: DashboardPageClientProps) {
  const chat = useAgentDashboardChat({ initialThreadId });

  return (
    <DashboardShell
      activeInspectorTab={chat.activeInspectorTab}
      artifactsRollbackBusy={chat.artifactsRollbackBusy}
      artifactsRollbackError={chat.artifactsRollbackError}
      contextPreferences={chat.contextPreferences}
      isSubmitting={chat.isSubmitting}
      inputTokenEstimate={chat.inputTokenEstimate}
      lastRollbackPayload={chat.lastRollbackPayload}
      lastRollbackResult={chat.lastRollbackResult}
      messages={chat.messages}
      traceSteps={chat.traceSteps}
      tokenUsage={chat.tokenUsage}
      onArtifactsRollback={chat.runArtifactsRollback}
      onInspectorTabChange={chat.setActiveInspectorTab}
      onLoadThread={(nextThreadId) => { void chat.loadThread(nextThreadId); }}
      onNewThread={() => { chat.clearRunDetail(); chat.resetThread(); }}
      onRollbackSelectedRun={chat.rollbackSelectedRun}
      onRunPrompt={(prompt) => { chat.clearRunDetail(); void chat.sendMessage(prompt); }}
      onToggleContextExclude={chat.toggleContextExclude}
      onToggleContextPin={chat.toggleContextPin}
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
