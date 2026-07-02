"use client";

import { type RefObject, useMemo } from "react";

import type {
  AgentChatMessage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

import { AgentComposer } from "./AgentComposer";
import { AgentConversation } from "./AgentConversation";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { MemoryWorkspace } from "./MemoryWorkspace";
import { useDashboardInspectorControl } from "../DashboardInspectorControlContext";
import { useDashboardMode } from "../DashboardModeContext";

type AgentWorkbenchProps = {
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
  onWorkbenchModeChange: (mode: AgentWorkbenchMode) => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  streamChanges: AgentStreamChangeEvent[];
  streamProgress: AgentStreamProgressEvent[];
  streamStages: AgentStreamStageEvent[];
  thinkingContent: string;
  threadId: null | number;
  threadTitle: string;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  workbenchMode: AgentWorkbenchMode;
};

export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
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
    onWorkbenchModeChange,
    pendingAction,
    statusLabel,
    streamChanges,
    streamProgress,
    streamStages,
    thinkingContent,
    threadId,
    threadTitle,
    traceSteps,
    transcriptRef,
    workbenchMode,
  } = props;

  const dashboardMode = useDashboardMode();
  const { debugMode } = useDashboardInspectorControl();

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
              onCapabilitySelect={(prompt) => {
                onInputChange(prompt);
                // Use setTimeout to let the input update before submitting
                setTimeout(() => onSubmit(), 0);
              }}
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
              onPlanConfirmationReturnToEdit={
                onSendMessage
                  ? () => {
                      void onSendMessage("我想返回修改这个计划草案");
                    }
                  : () => onEditApproval("plan")
              }
              onRenameThread={onRenameThread}
              debugMode={debugMode}
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              streamChanges={streamChanges}
              streamProgress={streamProgress}
              streamStages={streamStages}
              thinkingContent={thinkingContent}
              threadId={threadId}
              traceSteps={traceSteps}
              transcriptRef={transcriptRef}
              workbenchMode={workbenchMode}
            />
          )}
        </div>
        <AgentComposer
          disabled={isSubmitting}
          input={input}
          modelName="DeepSeek V3"
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
          onWorkbenchModeChange={onWorkbenchModeChange}
          pendingAction={pendingAction}
          placeholder="例如：整理今天最应该推进的一个动作"
          workbenchMode={workbenchMode}
        />
      </div>
    </AgentErrorBoundary>
  );
}
