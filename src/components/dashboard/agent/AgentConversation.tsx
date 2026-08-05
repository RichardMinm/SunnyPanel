"use client";

import { type RefObject, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import { AppButton } from "@/components/primitives/AppButton";
import type { AgentChatMessage, AgentTraceStep, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";

import { AgentThinkingPanel } from "./AgentThinkingPanel";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { isPlanConfirmationAction, PlanConfirmationCard } from "./PlanConfirmationCard";
import { ThreadHeader } from "./ThreadHeader";
import { MessageCard } from "./MessageCard";
import { riskLevelLabelMap } from "./constants";
import { compactAssistantMessageForPendingAction } from "./utils";
import { useDashboardMotion } from "../motion/dashboard-motion";

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
        <AppButton className="sunny-agent-confirm-button" disabled={disabled} onClick={onConfirm} type="button" variant="primary">
          全部确认
        </AppButton>
        <AppButton className="sunny-agent-cancel-button-v2" disabled={disabled} onClick={onCancel} type="button" variant="secondary">
          全部取消
        </AppButton>
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
  onChecklistDraftPrepareCreate?: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onPlanConfirmationReturnToEdit?: () => void;
  onPlanDraftGenerateChecklist?: () => void;
  onPlanDraftPrepareCreate?: () => void;
  onPlanDraftRevise?: () => void;
  onScheduleDraftPrepareCreate?: () => void;
  onScheduleDraftRevise?: () => void;
  onScheduleConflictSuggestionSelect?: (message: string) => void;
  onArchiveThread?: () => void;
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  statusLabel: string;
  streamChanges: AgentStreamChangeEvent[];
  streamStages: AgentStreamStageEvent[];
  threadId: null | number;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentConversation({
  displayTitle,
  errorMessage,
  isThinking,
  isSubmitting,
  messages,
  onCancelApproval,
  onChecklistDraftPrepareCreate,
  onConfirmApproval,
  onEditApproval,
  onPlanConfirmationReturnToEdit,
  onPlanDraftGenerateChecklist,
  onPlanDraftPrepareCreate,
  onPlanDraftRevise,
  onScheduleDraftPrepareCreate,
  onScheduleDraftRevise,
  onScheduleConflictSuggestionSelect,
  onArchiveThread,
  onRenameThread,
  pendingAction,
  statusLabel,
  streamChanges,
  streamStages,
  threadId,
  traceSteps,
  transcriptRef,
}: AgentConversationProps) {
  const {
    agentStatusView,
    agentSurfaceView,
    messageView,
    prefersReducedMotion,
  } = useDashboardMotion();
  const messageVariants = useMemo(
    () => ({
      assistant: {
        animate: messageView.animate,
        exit: messageView.exit,
        initial: prefersReducedMotion ? messageView.initial : { ...messageView.initial, x: -12 },
      },
      user: {
        animate: messageView.animate,
        exit: messageView.exit,
        initial: prefersReducedMotion ? messageView.initial : { ...messageView.initial, x: 12 },
      },
    }),
    [messageView, prefersReducedMotion],
  );
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }

    return -1;
  }, [messages]);
  const resolvedHeaderTitle = useMemo(() => {
    const normalizedTitle = displayTitle.trim();
    const firstUserMessage = messages
      .find((message) => message.role === "user")
      ?.content.trim().replace(/\s+/g, " ");
    const truncatedPrefix = normalizedTitle.endsWith("...")
      ? normalizedTitle.slice(0, -3).trimEnd()
      : "";

    if (
      firstUserMessage &&
      truncatedPrefix &&
      firstUserMessage.startsWith(truncatedPrefix)
    ) {
      return firstUserMessage.length > 80
        ? `${firstUserMessage.slice(0, 80).trimEnd()}...`
        : firstUserMessage;
    }

    return displayTitle;
  }, [displayTitle, messages]);

  const hasPendingConfirmation = Boolean(confirmationAction || (batchActions && batchActions.length > 0));

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript || (!isThinking && !hasPendingConfirmation)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (hasPendingConfirmation) {
        const approvalArea = transcript.querySelector(".sunny-agent-thread-action-area");
        approvalArea?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
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
    prefersReducedMotion,
    traceSteps.length,
    streamStages.length,
    streamChanges.length,
    transcriptRef,
  ]);

  return (
    <section className="sunny-agent-conversation-surface">
      <ThreadHeader
        displayTitle={resolvedHeaderTitle}
        isSubmitting={isSubmitting}
        onArchiveThread={onArchiveThread}
        onRenameThread={onRenameThread}
        pendingAction={pendingAction}
        statusLabel={statusLabel}
        threadId={threadId}
      />
      <div ref={transcriptRef} className="sunny-agent-conversation-scroll" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false} mode="popLayout">
          {messages.length === 0 ? (
            <motion.div
              animate={agentSurfaceView.animate}
              className="sunny-agent-welcome"
              exit={agentSurfaceView.exit}
              initial={agentSurfaceView.initial}
              key="welcome"
              transition={agentSurfaceView.transition}
            >
              <div className="sunny-agent-welcome-head">
                <h2>今天想推进什么？</h2>
                <p>直接描述你的目标。Sunny 会根据上下文选择合适的处理方式，需要修改数据时会先向你确认。</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="sunny-agent-transcript-content"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="transcript"
              transition={agentStatusView.transition}
            >
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
                      transition={messageView.transition}
                    >
                      <MessageCard
                        activitySteps={message.activitySteps}
                        content={messageContent}
                        isStreaming={isStreamingMsg}
                        onChecklistDraftPrepareCreate={isSubmitting ? undefined : onChecklistDraftPrepareCreate}
                        onPlanDraftGenerateChecklist={isSubmitting ? undefined : onPlanDraftGenerateChecklist}
                        onPlanDraftPrepareCreate={isSubmitting ? undefined : onPlanDraftPrepareCreate}
                        onPlanDraftRevise={isSubmitting ? undefined : onPlanDraftRevise}
                        onScheduleDraftPrepareCreate={isSubmitting ? undefined : onScheduleDraftPrepareCreate}
                        onScheduleDraftRevise={isSubmitting ? undefined : onScheduleDraftRevise}
                        planningChecklistDraft={message.planningChecklistDraft}
                        planningDraft={message.planningDraft}
                        role={message.role}
                        schedulingDraft={message.schedulingDraft}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {hasPendingConfirmation ? (
                  <motion.div
                    animate={agentSurfaceView.animate}
                    className="sunny-agent-thread-action-area"
                    exit={agentSurfaceView.exit}
                    initial={agentSurfaceView.initial}
                    key={confirmationAction?.id ?? "batch-confirmation"}
                    transition={agentSurfaceView.transition}
                  >
                    {confirmationAction ? (
                      isPlanConfirmationAction(confirmationAction) ? (
                        <PlanConfirmationCard
                          action={confirmationAction}
                          disabled={isSubmitting}
                          onCancel={onCancelApproval}
                          onConfirm={onConfirmApproval}
                          onReturnToEdit={onPlanConfirmationReturnToEdit ?? (() => onEditApproval("plan"))}
                        />
                      ) : (
                        <AgentApprovalCard
                          action={confirmationAction}
                          disabled={isSubmitting}
                          onCancel={onCancelApproval}
                          onConfirm={onConfirmApproval}
                          onEdit={onEditApproval}
                          onScheduleConflictSuggestionSelect={onScheduleConflictSuggestionSelect}
                        />
                      )
                    ) : batchActions && batchActions.length > 0 ? (
                      <BatchConfirmationCard
                        actions={batchActions}
                        disabled={isSubmitting}
                        onCancel={onCancelApproval}
                        onConfirm={onConfirmApproval}
                      />
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {isSubmitting ? (
                  <AgentThinkingPanel
                    active={isSubmitting}
                    key="agent-thinking"
                    statusLabel={statusLabel}
                    streamChanges={streamChanges}
                    streamStages={streamStages}
                  />
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {errorMessage ? (
          <motion.div
            animate={agentStatusView.animate}
            className="sunny-agent-error-card-v2"
            exit={agentStatusView.exit}
            initial={agentStatusView.initial}
            key="agent-error"
            role="alert"
            transition={agentStatusView.transition}
          >
            {errorMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
