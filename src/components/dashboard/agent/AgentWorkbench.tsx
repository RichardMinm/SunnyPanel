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
  const { debugMode, openInspector, setDebugMode } = useDashboardInspectorControl();

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
            <MemoryWorkspace messages={messages} statusLabel={statusLabel} threadId={threadId} />
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
              onOpenDetails={() => openInspector("context")}
              onRenameThread={onRenameThread}
              debugMode={debugMode}
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              onDebugModeChange={setDebugMode}
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
          onInputChange={onInputChange}
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
