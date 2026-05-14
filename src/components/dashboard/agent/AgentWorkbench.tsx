"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type {
  AgentChatMessage,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";

import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentComposer } from "./AgentComposer";
import { AgentConversation } from "./AgentConversation";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { AgentInspector } from "./AgentInspector";
import { AgentRunTabs } from "./AgentRunTabs";
import { AgentSidebar } from "./AgentSidebar";
import { AgentTraceTimeline } from "./AgentTraceTimeline";
import { AgentWorkbenchShell } from "./AgentWorkbenchShell";
import type { AgentInspectorTab, AgentRunSummary, AgentThreadSummary, AgentWorkbenchMode, AgentWorkbenchTab, ContextPreferences } from "./types";
import { useWorkbenchNarrow } from "./use-workbench-narrow";
import { getLatestAssistantMessage } from "./utils";

type AgentWorkbenchProps = {
  activeInspectorTab: AgentInspectorTab;
  activeTab: AgentWorkbenchTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences?: ContextPreferences;
  errorMessage: null | string;
  inboxSuggestions: AgentInboxSuggestion[];
  input: string;
  inputTokenEstimate: number;
  isSubmitting: boolean;
  isThinking: boolean;
  lastRollbackPayload?: null | unknown;
  messages: AgentChatMessage[];
  mode: AgentWorkbenchMode;
  onActiveInspectorTabChange: (tab: AgentInspectorTab) => void;
  onActiveTabChange: (tab: AgentWorkbenchTab) => void;
  onArtifactsRollback?: () => void;
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onLoadThread: (threadId: number) => void;
  onModeChange: (mode: AgentWorkbenchMode) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onStop?: () => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSubmit: () => void;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
    activeInspectorTab,
    activeTab,
    artifactsRollbackBusy,
    artifactsRollbackError,
    contextPreferences,
    errorMessage,
    inboxSuggestions,
    input,
    inputTokenEstimate,
    isSubmitting,
    isThinking,
    lastRollbackPayload,
    messages,
    mode,
    onActiveInspectorTabChange,
    onActiveTabChange,
    onArtifactsRollback,
    onCancelApproval,
    onEditApproval,
    onConfirmApproval,
    onInputChange,
    onLoadThread,
    onModeChange,
    onNewThread,
    onRunPrompt,
    onRunSuggestion,
    onStop,
    onSubmit,
    onToggleContextExclude,
    onToggleContextPin,
    pendingAction,
    quickPrompts,
    recentRuns,
    statusLabel,
    threadId,
    threads,
    tokenUsage,
    traceSteps,
    transcriptRef,
  } = props;

  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  const suggestedPlaceholder = quickPrompts[0]?.prompt ?? "整理今天最应该推进的一个动作";
  const inspectorDrawer = useWorkbenchNarrow();

  const center = (
    <>
      <AgentComposer
        disabled={isSubmitting}
        input={input}
        mode={mode}
        onInputChange={onInputChange}
        onModeChange={onModeChange}
        onStop={onStop}
        onSubmit={onSubmit}
        pendingAction={pendingAction}
        placeholder={`例如：${suggestedPlaceholder}`}
        statusLabel={statusLabel}
      />
      <AnimatePresence mode="wait">
        {confirmationAction ? (
          <motion.div
            key={confirmationAction.id}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <AgentApprovalCard
              action={confirmationAction}
              disabled={isSubmitting}
              onCancel={onCancelApproval}
              onConfirm={onConfirmApproval}
              onEdit={onEditApproval}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AgentRunTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} />
      <AnimatePresence mode="wait">
        {activeTab === "timeline" ? (
          <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AgentTraceTimeline
              isThinking={isThinking}
              latestAssistantMessage={latestAssistantMessage}
              statusLabel={statusLabel}
              steps={traceSteps}
            />
          </motion.div>
        ) : (
          <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AgentConversation
              errorMessage={errorMessage}
              isSubmitting={isSubmitting}
              messages={messages}
              transcriptRef={transcriptRef}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const sidebar = (
    <AgentSidebar
      disabled={isSubmitting}
      inboxSuggestions={inboxSuggestions}
      isThinking={isThinking}
      onLoadThread={onLoadThread}
      onNewThread={onNewThread}
      onRunPrompt={onRunPrompt}
      onRunSuggestion={onRunSuggestion}
      pendingAction={pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={recentRuns}
      statusLabel={statusLabel}
      threadId={threadId}
      threads={threads}
    />
  );

  const inspector = (
    <AgentInspector
      key={inspectorDrawer ? "inspector-drawer" : "inspector-inline"}
      action={confirmationAction}
      activeTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      drawer={inspectorDrawer}
      inputTokenEstimate={inputTokenEstimate}
      latestAssistantMessage={latestAssistantMessage}
      lastRollbackPayload={lastRollbackPayload}
      messages={messages}
      onActiveTabChange={onActiveInspectorTabChange}
      onArtifactsRollback={onArtifactsRollback}
      onToggleContextExclude={onToggleContextExclude}
      onToggleContextPin={onToggleContextPin}
      pendingAction={pendingAction}
      statusLabel={statusLabel}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
    />
  );

  return (
    <AgentErrorBoundary fallbackLabel="Agent \u5de5\u4f5c\u53f0\u51fa\u9519\u4e86">
      <AgentWorkbenchShell
        center={center}
        dataTestId="agent-workbench"
        inspector={inspector}
        inspectorDrawer={inspectorDrawer}
        sidebar={sidebar}
      />
    </AgentErrorBoundary>
  );
}
