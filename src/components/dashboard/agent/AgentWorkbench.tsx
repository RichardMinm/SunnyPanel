"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";

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
import { AgentThinkingPanel } from "./AgentThinkingPanel";
import type { AgentRollbackExecutionResult } from "./rollback-display";
import type { AgentInspectorTab, AgentRunDetail, ContextPreferences } from "./types";
import { getLatestAssistantMessage } from "./utils";

type AgentWorkbenchProps = {
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences?: ContextPreferences;
  errorMessage: null | string;
  input: string;
  inputTokenEstimate: number;
  isSubmitting: boolean;
  isThinking: boolean;
  lastRollbackPayload?: null | unknown;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  onActiveInspectorTabChange: (tab: AgentInspectorTab) => void;
  onArtifactsRollback?: () => void;
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onRollbackSelectedRun?: () => void;
  onStop?: () => void;
  onSubmit: () => void;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;
  pendingAction: null | PendingAction;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  thinkingContent: string;
  threadId: null | number;
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
    input,
    inputTokenEstimate,
    isSubmitting,
    isThinking,
    lastRollbackPayload,
    lastRollbackResult,
    messages,
    onActiveInspectorTabChange,
    onArtifactsRollback,
    onCancelApproval,
    onEditApproval,
    onConfirmApproval,
    onInputChange,
    onRollbackSelectedRun,
    onStop,
    onSubmit,
    onToggleContextExclude,
    onToggleContextPin,
    pendingAction,
    selectedRunDetail,
    selectedRunRollbackBusy,
    selectedRunRollbackError,
    statusLabel,
    thinkingContent,
    threadId,
    tokenUsage,
    traceSteps,
    transcriptRef,
  } = props;

  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);

  const inspectorPanel = (
    <AgentInspector
      drawer={true}
      action={confirmationAction}
      activeTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      inputTokenEstimate={inputTokenEstimate}
      latestAssistantMessage={latestAssistantMessage}
      lastRollbackPayload={lastRollbackPayload}
      lastRollbackResult={lastRollbackResult}
      messages={messages}
      onActiveTabChange={onActiveInspectorTabChange}
      onArtifactsRollback={onArtifactsRollback}
      onRollbackSelectedRun={onRollbackSelectedRun}
      onToggleContextExclude={onToggleContextExclude}
      onToggleContextPin={onToggleContextPin}
      pendingAction={pendingAction}
      selectedRunDetail={selectedRunDetail}
      selectedRunRollbackBusy={selectedRunRollbackBusy}
      selectedRunRollbackError={selectedRunRollbackError}
      statusLabel={statusLabel}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
    />
  );

  return (
    <AgentErrorBoundary fallbackLabel="Agent 工作台出错了">
      <div className="sunny-agent-center-surface">
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
          onInputChange={onInputChange}
          onStop={onStop}
          onSubmit={onSubmit}
          pendingAction={pendingAction}
          placeholder="例如：整理今天最应该推进的一个动作"
          statusLabel={statusLabel}
        />
      </div>
      {inspectorPanel}
    </AgentErrorBoundary>
  );
}
