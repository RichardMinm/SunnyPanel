"use client";

import { type RefObject, useMemo } from "react";

import type {
  AgentChatMessage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";

import { AgentComposer } from "./AgentComposer";
import { AgentConversation } from "./AgentConversation";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { MemoryWorkspace } from "./MemoryWorkspace";
import { useDashboardMode } from "../DashboardModeContext";

type AgentWorkbenchProps = {
  composerFocusRequestKey: number;
  errorMessage: null | string;
  input: string;
  isSubmitting: boolean;
  isThinking: boolean;
  messages: AgentChatMessage[];
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onArchiveThread?: () => void;
  onRenameThread: (title: string) => Promise<boolean>;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onSendMessage?: (message: string) => Promise<void> | void;
  onStop?: () => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  streamChanges: AgentStreamChangeEvent[];
  streamStages: AgentStreamStageEvent[];
  threadId: null | number;
  threadTitle: string;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
    composerFocusRequestKey,
    errorMessage,
    input,
    isSubmitting,
    isThinking,
    messages,
    onCancelApproval,
    onEditApproval,
    onArchiveThread,
    onRenameThread,
    onConfirmApproval,
    onInputChange,
    onSendMessage,
    onStop,
    onSubmit,
    pendingAction,
    statusLabel,
    streamChanges,
    streamStages,
    threadId,
    threadTitle,
    traceSteps,
    transcriptRef,
  } = props;

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
          {dashboardMode === "memory" ? (
            <MemoryWorkspace messages={messages} statusLabel={statusLabel} threadId={threadId} threadTitle={threadTitle} />
          ) : (
            <AgentConversation
              displayTitle={displayTitle}
              errorMessage={errorMessage}
              isThinking={isThinking}
              isSubmitting={isSubmitting}
              messages={messages}
              onArchiveThread={onArchiveThread}
              onCancelApproval={onCancelApproval}
              onConfirmApproval={onConfirmApproval}
              onEditApproval={onEditApproval}
              onChecklistDraftPrepareCreate={
                onSendMessage
                  ? () => {
                      void onSendMessage("就按这个清单草案创建清单");
                    }
                  : undefined
              }
              onPlanDraftGenerateChecklist={
                onSendMessage
                  ? () => {
                      void onSendMessage("请把这个计划草案拆成清单草案");
                    }
                  : undefined
              }
              onPlanDraftPrepareCreate={
                onSendMessage
                  ? () => {
                      void onSendMessage("就按这个草案创建计划");
                    }
                  : undefined
              }
              onPlanDraftRevise={() => {
                onInputChange("我想调整这个计划草案：");
              }}
              onScheduleDraftPrepareCreate={
                onSendMessage
                  ? () => {
                      void onSendMessage("就按这个日程草案创建日程");
                    }
                  : undefined
              }
              onScheduleDraftRevise={() => {
                onInputChange("我想调整这个日程草案：");
              }}
              onScheduleConflictSuggestionSelect={
                onSendMessage
                  ? (message) => {
                      void onSendMessage(message);
                    }
                  : undefined
              }
              onPlanConfirmationReturnToEdit={
                onSendMessage
                  ? () => {
                      void onSendMessage("我想返回修改这个计划草案");
                    }
                  : () => onEditApproval("plan")
              }
              onRenameThread={onRenameThread}
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              streamChanges={streamChanges}
              streamStages={streamStages}
              threadId={threadId}
              traceSteps={traceSteps}
              transcriptRef={transcriptRef}
            />
          )}
        </div>
        <AgentComposer
          focusRequestKey={composerFocusRequestKey}
          disabled={isSubmitting}
          input={input}
          onCancelApproval={onCancelApproval}
          onConfirmApproval={onConfirmApproval}
          onEditApproval={onEditApproval}
          onInputChange={onInputChange}
          onReturnToEditApproval={
            onSendMessage
              ? () => {
                  void onSendMessage("我想返回修改这个计划草案");
                }
              : undefined
          }
          onStop={onStop}
          onSubmit={onSubmit}
          pendingAction={pendingAction}
          placeholder="例如：整理今天最应该推进的一个动作"
        />
      </div>
    </AgentErrorBoundary>
  );
}
