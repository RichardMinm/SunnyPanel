"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type { AgentInspectorTab, AgentRunDetail, AgentThreadSummary, ContextPreferences } from "@/components/dashboard/agent/types";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentRollbackExecutionResult } from "@/components/dashboard/agent/rollback-display";
import { AppShell } from "./AppShell";
import type { DashboardIconMode } from "./DashboardIconBar";
import { DashboardInspectorControlProvider } from "./DashboardInspectorControlContext";
import { DashboardModeProvider } from "./DashboardModeContext";
import { DashboardRightPanel } from "./DashboardRightPanel";
import { DashboardStatusBar } from "./DashboardStatusBar";
import { InspectorPanelIcon } from "./icons";
import { MainWorkspace } from "./MainWorkspace";
import { SidebarNav } from "./SidebarNav";
import { ChecklistView } from "./checklist/ChecklistView";
import { ScheduleMonthView } from "./schedule/ScheduleMonthView";
import { MemoryCardGrid } from "./memory/MemoryCardGrid";
import { TimelineView } from "./timeline/TimelineView";
import { WritingWorkspace } from "./writing/WritingWorkspace";


type DashboardShellProps = {
  children: ReactNode;
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences: ContextPreferences;
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
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
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

const dashboardUrlModes = new Set<DashboardIconMode>([
  "agent",
  "checklist",
  "memory",
  "schedule",
  "timeline",
  "writing",
]);

const parseDashboardUrlMode = (value: null | string): DashboardIconMode =>
  dashboardUrlModes.has(value as DashboardIconMode) ? (value as DashboardIconMode) : "agent";

export function DashboardShell({
  activeInspectorTab,
  artifactsRollbackBusy,
  artifactsRollbackError,
  contextPreferences,
  isSubmitting,
  inputTokenEstimate,
  lastRollbackPayload,
  lastRollbackResult,
  messages,
  children,
  onLoadThread,
  onNewThread,
  onArchiveThread,
  onDeleteThread,
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
  const iconModeToWorkbenchMode = useMemo<Partial<Record<DashboardIconMode, AgentWorkbenchMode>>>(
    () => ({
      agent: "ask",
      timeline: "timeline",
      // schedule 和 memory 不走对话 pipeline，无需映射
    }),
    [],
  );

  const [activeMode, setActiveMode] = useState<DashboardIconMode>("agent");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(340);
  const [debugMode, setDebugMode] = useState(false);
  const [lastExecutedAction, setLastExecutedAction] = useState<ProposedAgentAction | null>(null);
  const suppressAutoOpenRef = useRef(false);
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;

  // When a write action enters await_confirmation, snapshot it so the right panel
  // can keep showing linked objects after the user confirms and pendingAction clears.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- snapshot pending write action for the inspector after the pending state clears */
    if (pendingAction?.type === "await_confirmation") {
      setLastExecutedAction(pendingAction.action);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pendingAction]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate Dashboard mode from URL after the client route is available */
    const mode = parseDashboardUrlMode(new URLSearchParams(window.location.search).get("mode"));
    if (mode !== "agent") {
      setActiveMode(mode);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Wrap the inspector tab change to clear the persisted action when the user
  // navigates away from the linked tab.
  const handleInspectorTabChange = useCallback(
    (tab: AgentInspectorTab) => {
      if (tab !== "linked") {
        setLastExecutedAction(null);
      }
      onInspectorTabChange(tab);
    },
    [onInspectorTabChange],
  );
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
      const params = new URLSearchParams(window.location.search);
      if (_mode === "agent") {
        params.delete("mode");
      } else {
        params.set("mode", _mode);
      }
      const nextQuery = params.toString();
      window.history.replaceState(null, "", nextQuery ? `/dashboard?${nextQuery}` : "/dashboard");
      const wm = iconModeToWorkbenchMode[_mode];
      if (wm) {
        onWorkbenchModeChange?.(wm);
      }
      if (prompt) {
        onRunPrompt(prompt);
      }
    },
    [iconModeToWorkbenchMode, onRunPrompt, onWorkbenchModeChange],
  );

  const handleNewThread = useCallback(() => {
    suppressAutoOpenRef.current = true;
    setPanelOpen(false);
    setLastExecutedAction(null);
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
        onArchiveThread={onArchiveThread}
        onDeleteThread={onDeleteThread}
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
            isSubmitting={isSubmitting}
          />
        ) : activeMode === "memory" ? (
          <MemoryCardGrid
            onBackToWorkbench={() => setActiveMode("agent")}
            threadId={threadId}
          />
        ) : activeMode === "checklist" ? (
          <ChecklistView
            onBackToWorkbench={() => setActiveMode("agent")}
            threadId={threadId}
          />
        ) : activeMode === "timeline" ? (
          <TimelineView
            onBackToWorkbench={() => setActiveMode("agent")}
            threadId={threadId}
          />
        ) : activeMode === "writing" ? (
          <WritingWorkspace />
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
        lastExecutedAction={lastExecutedAction}
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
        onInspectorTabChange={handleInspectorTabChange}
        onTogglePanel={handleTogglePanel}
        panelOpen={panelOpen}
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
        workbenchMode={workbenchMode}
      />
      <button
        type="button"
        className="sunny-dashboard-inspector-toggle"
        aria-label={panelOpen ? "收起检查器" : "展开检查器"}
        title={panelOpen ? "收起检查器" : "展开检查器"}
        onClick={handleTogglePanel}
      >
        <InspectorPanelIcon open={panelOpen} />
      </button>

      {activeMode !== "schedule" && (
        <DashboardStatusBar
          statusLabel={statusLabel}
        />
      )}
    </AppShell>
  );
}
