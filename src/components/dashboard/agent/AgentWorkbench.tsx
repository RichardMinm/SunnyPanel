"use client";

import type { RefObject } from "react";
import { useCallback, useState } from "react";
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
import { useDashboardLayout } from "./DashboardLayoutSwitcher";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { AgentInspector } from "./AgentInspector";
import { AgentThinkingPanel } from "./AgentThinkingPanel";
import { AgentSidebar } from "./AgentSidebar";
import { AgentWorkbenchShell } from "./AgentWorkbenchShell";
import type { AgentInspectorTab, AgentRunSummary, AgentThreadSummary, AgentWorkbenchMode, ContextPreferences } from "./types";
import { getLatestAssistantMessage } from "./utils";

type AgentWorkbenchProps = {
  activeInspectorTab: AgentInspectorTab;
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
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onArtifactsRollback?: () => void;
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onLoadThread: (threadId: number) => void;
  onModeChange: (mode: AgentWorkbenchMode) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onSearchThreads?: (query: string) => void;
  onStop?: () => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSubmit: () => void;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  suggestedMode?: AgentWorkbenchMode | null;
  thinkingContent: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
    activeInspectorTab,
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
    onArchiveThread,
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
    onSearchThreads,
    onStop,
    onSubmit,
    onToggleContextExclude,
    onToggleContextPin,
    pendingAction,
    quickPrompts,
    recentRuns,
    statusLabel,
    suggestedMode,
    thinkingContent,
    threadId,
    threads,
    tokenUsage,
    traceSteps,
    transcriptRef,
  } = props;

  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  const suggestedPlaceholder = quickPrompts[0]?.prompt ?? "整理今天最应该推进的一个动作";
  const { layout } = useDashboardLayout();
  /* Inspector is always visible as a collapsible right panel */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const inspectorPanel = (
    <AgentInspector
      compact={false}
      action={confirmationAction}
      activeTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
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

  const center = (
    <>
      <div className="sunny-agent-unified-body">
        <AgentThinkingPanel isThinking={isThinking} statusLabel={statusLabel} steps={traceSteps} thinkingContent={thinkingContent} />
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
          ) : batchActions && batchActions.length > 0 ? (
            <motion.div
              key="batch-confirm"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="sunny-agent-batch-approval"
            >
              <p className="text-sm font-semibold text-foreground">批量确认（{batchActions.length} 项）</p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {batchActions.map((action, index) => (
                  <li key={action.id} className="rounded-md border border-border/60 px-3 py-2">
                    <span className="font-medium text-foreground">{index + 1}. </span>
                    {action.summary}
                  </li>
                ))}
              </ul>
              <motion.div layout className="mt-4 flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  className="sunny-button-primary px-4 py-2 text-sm"
                  disabled={isSubmitting}
                  onClick={onConfirmApproval}
                  whileTap={{ scale: 0.96 }}
                >
                  全部确认
                </motion.button>
                <motion.button
                  type="button"
                  className="sunny-button-secondary px-4 py-2 text-sm"
                  disabled={isSubmitting}
                  onClick={onCancelApproval}
                  whileTap={{ scale: 0.96 }}
                >
                  全部取消
                </motion.button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AgentConversation
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          messages={messages}
          statusLabel={statusLabel}
          transcriptRef={transcriptRef}
        />
      </div>
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
        suggestedMode={suggestedMode}
      />
    </>
  );

  const sidebar = (
    <div className={`sunny-agent-left-rail-column${sidebarCollapsed ? " is-collapsed" : ""}`}>
      {sidebarCollapsed ? (
        <button
          type="button"
          className="sunny-agent-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="\u5c55\u5f00\u4fa7\u8fb9\u680f"
          title="\u5c55\u5f00\u4fa7\u8fb9\u680f"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 2L9 6L5 10" />
          </svg>
        </button>
      ) : (
        <>
          <button
            type="button"
            className="sunny-agent-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label="\u6536\u8d77\u4fa7\u8fb9\u680f"
            title="\u6536\u8d77\u4fa7\u8fb9\u680f"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 2L3 6L7 10" />
            </svg>
          </button>
          <AgentSidebar
            disabled={isSubmitting}
            inboxSuggestions={inboxSuggestions}
            isThinking={isThinking}
            onArchiveThread={onArchiveThread}
            onLoadThread={onLoadThread}
            onNewThread={onNewThread}
            onRunPrompt={onRunPrompt}
            onRunSuggestion={onRunSuggestion}
            onSearchThreads={onSearchThreads}
            pendingAction={pendingAction}
            quickPrompts={quickPrompts}
            recentRuns={recentRuns}
            statusLabel={statusLabel}
            threadId={threadId}
            threads={threads}
          />
        </>
      )}
    </div>
  );

  return (
    <AgentErrorBoundary fallbackLabel="Agent \u5de5\u4f5c\u53f0\u51fa\u9519\u4e86">
      <AgentWorkbenchShell
        center={center}
        dataTestId="agent-workbench"
        inspector={inspectorPanel}
        inspectorDrawer={false}
        layout={layout}
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
    </AgentErrorBoundary>
  );
}
