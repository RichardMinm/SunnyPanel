"use client";

import { type RefObject, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentChatMessage, AgentTraceStep, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

import { AgentThinkingPanel } from "./AgentThinkingPanel";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { ThreadHeader } from "./ThreadHeader";
import { MessageCard } from "./MessageCard";
import { riskLevelLabelMap } from "./constants";
import { compactAssistantMessageForPendingAction } from "./utils";

const messageVariants = {
  assistant: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: -12 } },
  user: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: 12 } },
};

function summarizeBatchRisk(actions: ProposedAgentAction[]) {
  if (actions.some((action) => action.riskLevel === "high")) return "高风险";
  if (actions.some((action) => action.riskLevel === "medium")) return "中风险";
  return "低风险";
}

function BatchConfirmationCard({
  actions,
  disabled,
  onCancel,
  onConfirm,
}: {
  actions: ProposedAgentAction[];
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      id="agent-pending-approval"
      className="sunny-agent-approval-banner sunny-agent-approval-banner-batch"
      aria-label="批量待确认操作"
    >
      <div className="sunny-agent-approval-banner-main">
        <div>
          <p>等待确认 · 批量操作</p>
          <h3>确认 {actions.length} 项操作</h3>
        </div>
        <span>{summarizeBatchRisk(actions)}</span>
      </div>
      <div className="sunny-agent-confirmation-grid" aria-label="批量操作摘要">
        <div>
          <span>操作类型</span>
          <strong>批量执行</strong>
        </div>
        <div>
          <span>影响范围</span>
          <strong>将影响 {actions.length} 项数据</strong>
        </div>
        <div>
          <span>风险等级</span>
          <strong>{summarizeBatchRisk(actions)}</strong>
        </div>
        <div>
          <span>写入数据库</span>
          <strong>确认后写入</strong>
        </div>
      </div>
      <ul className="sunny-agent-confirmation-effects">
        {actions.slice(0, 5).map((action, index) => (
          <li key={action.id}>
            <strong>{index + 1}. {riskLevelLabelMap[action.riskLevel]}</strong>
            <span>{action.summary}</span>
          </li>
        ))}
      </ul>
      <div className="sunny-agent-approval-banner-actions" role="toolbar" aria-label="确认或取消批量操作">
        <button type="button" className="sunny-agent-confirm-button" disabled={disabled} onClick={onConfirm}>
          全部确认
        </button>
        <button type="button" className="sunny-agent-cancel-button-v2" disabled={disabled} onClick={onCancel}>
          全部取消
        </button>
      </div>
    </section>
  );
}

type AgentConversationProps = {
  displayTitle: string;
  errorMessage: null | string;
  isThinking: boolean;
  isSubmitting: boolean;
  messages: AgentChatMessage[];
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
  onDebugModeChange: (next: boolean) => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onOpenDetails: () => void;
  onArchiveThread?: () => void;
  onRenameThread: (title: string) => Promise<boolean>;
  debugMode: boolean;
  pendingAction: null | PendingAction;
  statusLabel: string;
  streamChanges: AgentStreamChangeEvent[];
  streamProgress: AgentStreamProgressEvent[];
  streamStages: AgentStreamStageEvent[];
  thinkingContent: string;
  threadId: null | number;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  workbenchMode: AgentWorkbenchMode;
};

export function AgentConversation({
  displayTitle,
  errorMessage,
  isThinking,
  isSubmitting,
  messages,
  onCancelApproval,
  onConfirmApproval,
  onDebugModeChange,
  onEditApproval,
  onOpenDetails,
  onArchiveThread,
  onRenameThread,
  debugMode,
  pendingAction,
  statusLabel,
  streamChanges,
  streamProgress,
  streamStages,
  thinkingContent,
  threadId,
  traceSteps,
  transcriptRef,
  workbenchMode,
}: AgentConversationProps) {
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }

    return -1;
  }, [messages]);

  const hasPendingConfirmation = Boolean(confirmationAction || (batchActions && batchActions.length > 0));

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript || (!isThinking && !hasPendingConfirmation)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (hasPendingConfirmation) {
        const approvalArea = transcript.querySelector(".sunny-agent-thread-action-area");
        approvalArea?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }

      transcript.scrollTo({
        behavior: "auto",
        top: transcript.scrollHeight,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    batchActions,
    confirmationAction?.id,
    hasPendingConfirmation,
    isThinking,
    messages.length,
    thinkingContent,
    traceSteps.length,
    streamStages.length,
    streamProgress.length,
    streamChanges.length,
    transcriptRef,
  ]);

  return (
    <section className="sunny-agent-conversation-surface">
      <ThreadHeader
        displayTitle={displayTitle}
        debugMode={debugMode}
        isSubmitting={isSubmitting}
        onArchiveThread={onArchiveThread}
        onDebugModeChange={onDebugModeChange}
        onOpenDetails={onOpenDetails}
        onRenameThread={onRenameThread}
        pendingAction={pendingAction}
        statusLabel={statusLabel}
        threadId={threadId}
        workbenchMode={workbenchMode}
      />
      <div ref={transcriptRef} className="sunny-agent-conversation-scroll" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="sunny-agent-empty-state">
            <strong>准备好开始一次 Agent 会话</strong>
            <span>描述目标、约束或需要推进的任务，Agent 会自动判断是咨询、规划还是执行。</span>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const variant = messageVariants[message.role === "assistant" ? "assistant" : "user"];
                const isStreamingMsg = isSubmitting && message.role === "assistant" && index === lastAssistantIndex;
                const shouldCompactAssistant =
                  message.role === "assistant" &&
                  index === lastAssistantIndex &&
                  hasPendingConfirmation &&
                  !isStreamingMsg;
                const messageContent =
                  message.role === "assistant"
                    ? compactAssistantMessageForPendingAction(
                        message.content,
                        shouldCompactAssistant ? pendingAction : null,
                      )
                    : message.content;

                return (
                  <motion.div
                    key={`${message.role}-${index}`}
                    className={`sunny-agent-message-row sunny-agent-message-row-${message.role}`}
                    initial={variant.initial}
                    animate={variant.animate}
                    exit={variant.exit}
                    transition={{ duration: 0.25 }}
                  >
                    <MessageCard
                      content={
                        messageContent || (isSubmitting && index === messages.length - 1 ? "正在生成回复..." : "")
                      }
                      isStreaming={isStreamingMsg}
                      isThinking={isStreamingMsg && isThinking}
                      role={message.role}
                      thinkingContent={
                        isStreamingMsg && thinkingContent.trim()
                          ? thinkingContent
                          : undefined
                      }
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {hasPendingConfirmation ? (
              <div className="sunny-agent-thread-action-area">
                {confirmationAction ? (
                  <AgentApprovalCard
                    action={confirmationAction}
                    disabled={isSubmitting}
                    onCancel={onCancelApproval}
                    onConfirm={onConfirmApproval}
                    onEdit={onEditApproval}
                  />
                ) : batchActions && batchActions.length > 0 ? (
                  <BatchConfirmationCard
                    actions={batchActions}
                    disabled={isSubmitting}
                    onCancel={onCancelApproval}
                    onConfirm={onConfirmApproval}
                  />
                ) : null}
              </div>
            ) : null}
            <AgentThinkingPanel
              isThinking={isThinking}
              statusLabel={statusLabel}
              steps={traceSteps}
              streamChanges={streamChanges}
              streamProgress={streamProgress}
              streamStages={streamStages}
              thinkingContent={thinkingContent}
            />
          </>
        )}
      </div>
      {errorMessage ? <div className="sunny-agent-error-card-v2" role="alert">{errorMessage}</div> : null}
    </section>
  );
}
