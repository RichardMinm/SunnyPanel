"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage, PendingAction } from "@/lib/agent/schemas";
import type { AgentInspectorTab, AgentRunDetail, AgentThreadSummary, ContextPreferences } from "@/components/dashboard/agent/types";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentRollbackExecutionResult } from "@/components/dashboard/agent/rollback-display";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { AppShell } from "./AppShell";
import type { DashboardIconMode } from "./DashboardIconBar";
import { DashboardInspectorControlProvider } from "./DashboardInspectorControlContext";
import { DashboardModeProvider } from "./DashboardModeContext";
import { DashboardRightPanel } from "./DashboardRightPanel";
import { DashboardStatusBar } from "./DashboardStatusBar";
import { MainWorkspace } from "./MainWorkspace";
import { SidebarNav } from "./SidebarNav";
import { ScheduleMonthView } from "./schedule/ScheduleMonthView";
import { MemoryCardGrid } from "./memory/MemoryCardGrid";


type DashboardShellProps = {
  children: ReactNode;
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences: ContextPreferences;
  initialSuggestions: AgentInboxSuggestion[];
  isSubmitting: boolean;
  /* Right panel */
  inputTokenEstimate: number;
  lastRollbackPayload?: null | unknown;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  onInspectorTabChange: (tab: AgentInspectorTab) => void;
  onArtifactsRollback?: () => void;
  onRollbackSelectedRun?: () => void;
  onToggleContextExclude: (key: string) => void;
  onToggleContextPin: (key: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  pendingAction: null | PendingAction;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
  onWorkbenchModeChange?: (mode: AgentWorkbenchMode) => void;
  workbenchMode: AgentWorkbenchMode;
};

export function DashboardShell({
  activeInspectorTab,
  artifactsRollbackBusy,
  artifactsRollbackError,
  contextPreferences,
  initialSuggestions,
  isSubmitting,
  inputTokenEstimate,
  lastRollbackPayload,
  lastRollbackResult,
  messages,
  children,
  onLoadThread,
  onNewThread,
  onInspectorTabChange,
  onArtifactsRollback,
  onRollbackSelectedRun,
  onRunPrompt,
  onToggleContextExclude,
  onToggleContextPin,
  pendingAction,
  selectedRunDetail,
  selectedRunRollbackBusy,
  selectedRunRollbackError,
  statusLabel,
  threadId,
  threads,
  tokenUsage,
  traceSteps,
  onWorkbenchModeChange,
  workbenchMode,
}: DashboardShellProps) {
  const iconModeToWorkbenchMode: Partial<Record<DashboardIconMode, AgentWorkbenchMode>> = {
    agent: "ask",
    today: "today",
    plans: "plan",
    writing: "writing",
    // schedule 和 memory 不走对话 pipeline，无需映射
  };

  const [activeMode, setActiveMode] = useState<DashboardIconMode>("agent");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(340);
  const [debugMode, setDebugMode] = useState(false);
  const suppressAutoOpenRef = useRef(false);
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const autoInspectorTab = useMemo<AgentInspectorTab | null>(() => {
    if (pendingAction) {
      return "approval";
    }

    if ((isSubmitting && workbenchMode === "execute") || selectedRunDetail || lastRollbackResult) {
      return "trace";
    }

    if (debugMode) {
      return activeInspectorTab;
    }

    return null;
  }, [
    activeInspectorTab,
    debugMode,
    isSubmitting,
    lastRollbackResult,
    pendingAction,
    selectedRunDetail,
    workbenchMode,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const closePanelForMobile = () => {
      if (mediaQuery.matches) {
        setPanelOpen(false);
      }
    };

    closePanelForMobile();
    mediaQuery.addEventListener("change", closePanelForMobile);

    return () => {
      mediaQuery.removeEventListener("change", closePanelForMobile);
    };
  }, []);

  const handleModeChange = useCallback(
    (_mode: DashboardIconMode, prompt: string) => {
      setActiveMode(_mode);
      const wm = iconModeToWorkbenchMode[_mode];
      if (wm) {
        onWorkbenchModeChange?.(wm);
      }
      if (prompt) {
        onRunPrompt(prompt);
      }
    },
    [onRunPrompt, onWorkbenchModeChange],
  );

  const handleNewThread = useCallback(() => {
    suppressAutoOpenRef.current = true;
    setPanelOpen(false);
    onNewThread();
    window.requestAnimationFrame(() => {
      setPanelOpen(false);
      suppressAutoOpenRef.current = false;
    });
  }, [onNewThread]);

  const handleTogglePanel = useCallback(() => {
    setPanelOpen((v) => !v);
  }, []);

  const openInspector = useCallback(
    (tab?: AgentInspectorTab) => {
      if (tab) {
        onInspectorTabChange(tab);
      }
      setPanelOpen(true);
    },
    [onInspectorTabChange],
  );

  useEffect(() => {
    if (!autoInspectorTab || suppressAutoOpenRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      openInspector(autoInspectorTab);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoInspectorTab, openInspector]);

  const inspectorControl = useMemo(
    () => ({
      debugMode,
      openInspector,
      setDebugMode,
    }),
    [debugMode, openInspector],
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = panelWidth;

      document.documentElement.classList.add("sunny-dashboard-is-resizing");

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + (startX - moveEvent.clientX);
        setPanelWidth(Math.min(420, Math.max(320, nextWidth)));
      };

      const handlePointerUp = () => {
        document.documentElement.classList.remove("sunny-dashboard-is-resizing");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [panelWidth],
  );

  return (
    <AppShell panelOpen={panelOpen} panelWidth={panelWidth}>
      <SidebarNav
        activeMode={activeMode}
        initialSuggestions={initialSuggestions}
        onLoadThread={onLoadThread}
        onModeChange={handleModeChange}
        onNewThread={handleNewThread}
        threadId={threadId}
        threads={threads}
      />

      <MainWorkspace>
        {activeMode === "schedule" ? (
          <ScheduleMonthView
            onBackToWorkbench={() => setActiveMode("agent")}
            threadId={threadId}
          />
        ) : activeMode === "memory" ? (
          <MemoryCardGrid
            onBackToWorkbench={() => setActiveMode("agent")}
            threadId={threadId}
          />
        ) : (
          <DashboardInspectorControlProvider value={inspectorControl}>
            <DashboardModeProvider value={activeMode}>
              {children}
            </DashboardModeProvider>
          </DashboardInspectorControlProvider>
        )}
      </MainWorkspace>

      <DashboardRightPanel
        action={confirmationAction}
        activeInspectorTab={activeInspectorTab}
        artifactsRollbackBusy={artifactsRollbackBusy}
        artifactsRollbackError={artifactsRollbackError}
        contextPreferences={contextPreferences}
        debugMode={debugMode}
        inputTokenEstimate={inputTokenEstimate}
        latestAssistantMessage={latestAssistantMessage}
        lastRollbackPayload={lastRollbackPayload}
        lastRollbackResult={lastRollbackResult}
        messages={messages}
        onResizeStart={handleResizeStart}
        onArtifactsRollback={onArtifactsRollback}
        onInspectorTabChange={onInspectorTabChange}
        onTogglePanel={handleTogglePanel}
        onRollbackSelectedRun={onRollbackSelectedRun}
        onToggleContextExclude={onToggleContextExclude}
        onToggleContextPin={onToggleContextPin}
        panelOpen={panelOpen}
        pendingAction={pendingAction}
        selectedRunDetail={selectedRunDetail}
        selectedRunRollbackBusy={selectedRunRollbackBusy}
        selectedRunRollbackError={selectedRunRollbackError}
        statusLabel={statusLabel}
        threadId={threadId}
        tokenUsage={tokenUsage}
        traceSteps={traceSteps}
        workbenchMode={workbenchMode}
      />

      <DashboardStatusBar
        statusLabel={statusLabel}
      />
    </AppShell>
  );
}
