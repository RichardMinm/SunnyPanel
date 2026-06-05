"use client";

import { type RefObject, useMemo } from "react";
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
import { MemoryWorkspace } from "./MemoryWorkspace";
import { useDashboardMode } from "../DashboardModeContext";

type AgentWorkbenchProps = {
  errorMessage: null | string;
  input: string;
  lastInteractionAt: null | string;
  isSubmitting: boolean;
  isThinking: boolean;
  messages: AgentChatMessage[];
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onRenameThread: (title: string) => Promise<boolean>;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onStop?: () => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  thinkingContent: string;
  threadId: null | number;
  threadTitle: string;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
    errorMessage,
    input,
    lastInteractionAt,
    isSubmitting,
    isThinking,
    messages,
    onCancelApproval,
    onEditApproval,
    onRenameThread,
    onConfirmApproval,
    onInputChange,
    onStop,
    onSubmit,
    pendingAction,
    statusLabel,
    thinkingContent,
    threadId,
    threadTitle,
    tokenUsage,
    traceSteps,
    transcriptRef,
  } = props;

  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const dashboardMode = useDashboardMode();

  const displayTitle = useMemo(() => {
    if (threadTitle && threadTitle !== "Agent Thread") return threadTitle;
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg?.content) {
      const trimmed = firstUserMsg.content.trim().replace(/\s+/g, " ");
      return trimmed.length > 30 ? `${trimmed.slice(0, 30).trimEnd()}...` : trimmed;
    }
    return "新会话";
  }, [threadTitle, messages]);

  return (
    <AgentErrorBoundary fallbackLabel="Agent 工作台出错了">
      <div className="sunny-agent-center-surface">
        <div className="sunny-agent-unified-body">
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
          {dashboardMode === "memory" ? (
            <MemoryWorkspace messages={messages} statusLabel={statusLabel} threadId={threadId} />
          ) : (
            <AgentConversation
              displayTitle={displayTitle}
              errorMessage={errorMessage}
              isThinking={isThinking}
              isSubmitting={isSubmitting}
              lastInteractionAt={lastInteractionAt}
              messages={messages}
              onRenameThread={onRenameThread}
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              thinkingContent={thinkingContent}
              threadId={threadId}
              tokenUsage={tokenUsage}
              traceSteps={traceSteps}
              transcriptRef={transcriptRef}
            />
          )}
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
    </AgentErrorBoundary>
  );
}
