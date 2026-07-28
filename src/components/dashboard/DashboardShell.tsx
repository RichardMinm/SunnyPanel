"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";
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
import {
  getLinkedObjectNavigationDestination,
  LinkedObjectNavigationProvider,
  replaceDashboardModeInSearch,
  type LinkedObjectNavigationTarget,
} from "./linked-objects";
import { MainWorkspace } from "./MainWorkspace";
import { SidebarNav } from "./SidebarNav";
import { WritingDocumentsProvider } from "./writing/WritingDocumentsContext";
import { WritingLibraryFiltersProvider } from "./writing/WritingLibraryFiltersContext";
import { WritingLayoutProvider } from "./writing/WritingLayoutContext";
import type { WritingSaveStatusSnapshot } from "./writing/writing-types";
import { formatWritingSaveStatusLabel } from "@/lib/dashboard/writing-save-status";

/* ─── Mode workspaces (dynamic: only the active mode's code is downloaded) ─── */

const PlaceholderWorkspace = () => (
  <MainWorkspace><div className="sunny-dashboard-mode-loading" /></MainWorkspace>
);

const WritingWorkspace = dynamic(
  () => import("./writing/WritingWorkspace").then((m) => m.WritingWorkspace),
  { loading: PlaceholderWorkspace },
);

const ScheduleMonthView = dynamic(
  () => import("./schedule/ScheduleMonthView").then((m) => m.ScheduleMonthView),
  { loading: PlaceholderWorkspace },
);

const MemoryCardGrid = dynamic(
  () => import("./memory/MemoryCardGrid").then((m) => m.MemoryCardGrid),
  { loading: PlaceholderWorkspace },
);

const ChecklistView = dynamic(
  () => import("./checklist/ChecklistView").then((m) => m.ChecklistView),
  { loading: PlaceholderWorkspace },
);

const TimelineView = dynamic(
  () => import("./timeline/TimelineView").then((m) => m.TimelineView),
  { loading: PlaceholderWorkspace },
);

const formatWritingBarLabel = (status: WritingSaveStatusSnapshot) => {
  const savePart = formatWritingSaveStatusLabel(status);
  const parts = [savePart];
  if (typeof status.wordCount === "number") {
    parts.push(`${status.wordCount.toLocaleString("zh-CN")} 字`);
  }
  if (typeof status.readingMinutes === "number") {
    parts.push(`约 ${status.readingMinutes} 分钟`);
  }
  if (status.lastEdited) {
    parts.push(`最后编辑 ${status.lastEdited}`);
  }
  return parts.join(" · ");
};


type DashboardShellProps = {
  children: ReactNode;
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences: ContextPreferences;
  isSubmitting: boolean;
  /* Right panel */
  inputTokenEstimate: number;
  lastRollbackSourceRunId?: null | number;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  turnAudit?: AgentTurnTrace | null;
  tokenUsage: AgentTokenUsage;
  onInspectorTabChange: (tab: AgentInspectorTab) => void;
  onArtifactsRollback?: () => void;
  onPrefillComposer?: (
    prompt: string,
    source?: {
      suggestedPrompt: string;
      suggestionId: number;
    },
  ) => void;
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

const SIDEBAR_PINNED_STORAGE_KEY = "sunny-dashboard-sidebar-pinned";

const readSidebarPinned = () => {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY);
    if (raw === null) {
      return true;
    }

    return raw === "true";
  } catch {
    return true;
  }
};

const persistSidebarPinned = (pinned: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, String(pinned));
  } catch {
    // ignore storage failures
  }
};

export function DashboardShell({
  activeInspectorTab,
  artifactsRollbackBusy,
  artifactsRollbackError,
  contextPreferences,
  isSubmitting,
  inputTokenEstimate,
  lastRollbackSourceRunId,
  lastRollbackResult,
  messages,
  children,
  onLoadThread,
  onNewThread,
  onArchiveThread,
  onDeleteThread,
  onInspectorTabChange,
  onArtifactsRollback,
  onPrefillComposer,
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
  turnAudit,
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
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHoverExpanded, setSidebarHoverExpanded] = useState(false);
  const [writingFocusMode, setWritingFocusMode] = useState(false);
  const [writingSaveStatus, setWritingSaveStatus] = useState<null | WritingSaveStatusSnapshot>(null);
  const sidebarExpanded = sidebarPinned || sidebarHoverExpanded;
  const [debugMode, setDebugMode] = useState(false);
  const [lastExecutedAction, setLastExecutedAction] = useState<ProposedAgentAction | null>(null);
  const [linkedObjectNavigationTarget, setLinkedObjectNavigationTarget] =
    useState<LinkedObjectNavigationTarget | null>(null);
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
    setSidebarPinned(readSidebarPinned());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleSidebarPinnedChange = useCallback((pinned: boolean) => {
    setSidebarPinned(pinned);
    persistSidebarPinned(pinned);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear transient writing save status when leaving writing mode */
    if (activeMode !== "writing") {
      setWritingSaveStatus(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeMode]);

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

  const transitionDashboardMode = useCallback(
    (_mode: DashboardIconMode) => {
      setActiveMode(_mode);
      window.history.replaceState(
        null,
        "",
        replaceDashboardModeInSearch(window.location.search, _mode),
      );
      const wm = iconModeToWorkbenchMode[_mode];
      if (wm) {
        onWorkbenchModeChange?.(wm);
      }
    },
    [iconModeToWorkbenchMode, onWorkbenchModeChange],
  );

  const handleModeChange = useCallback(
    (_mode: DashboardIconMode, prompt: string) => {
      setLinkedObjectNavigationTarget(null);
      transitionDashboardMode(_mode);
      if (prompt) {
        onRunPrompt(prompt);
      }
    },
    [onRunPrompt, transitionDashboardMode],
  );

  const handleLinkedObjectNavigate = useCallback(
    (target: LinkedObjectNavigationTarget) => {
      const destination = getLinkedObjectNavigationDestination(target);
      setLinkedObjectNavigationTarget(destination.target);
      transitionDashboardMode(destination.activeMode);
      if (destination.activeMode === "agent") {
        onInspectorTabChange(destination.activeInspectorTab);
        setPanelOpen(destination.panelOpen);
      }
    },
    [onInspectorTabChange, transitionDashboardMode],
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

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setSidebarHoverExpanded(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panelOpen]);

  const inspectorControl = useMemo(
    () => ({
      debugMode,
      openInspector,
      panelOpen,
      setDebugMode,
      togglePanel: handleTogglePanel,
    }),
    [debugMode, handleTogglePanel, openInspector, panelOpen],
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
    <LinkedObjectNavigationProvider onNavigate={handleLinkedObjectNavigate}>
    <AppShell
      panelOpen={activeMode !== "writing" && panelOpen}
      panelWidth={panelWidth}
      sidebarCollapsed={activeMode === "writing" && writingFocusMode}
      sidebarExpanded={sidebarExpanded}
      sidebarPinned={sidebarPinned}
      writingMode={activeMode === "writing"}
    >
      {activeMode === "writing" ? (
        <WritingLayoutProvider onFocusModeChange={setWritingFocusMode}>
          <WritingDocumentsProvider>
            <WritingLibraryFiltersProvider>
            <SidebarNav
              activeMode={activeMode}
              hoverExpanded={sidebarHoverExpanded}
              onArchiveThread={onArchiveThread}
              onDeleteThread={onDeleteThread}
              onHoverExpandedChange={setSidebarHoverExpanded}
              onLoadThread={onLoadThread}
              onModeChange={handleModeChange}
              onNewThread={handleNewThread}
              onPinnedChange={handleSidebarPinnedChange}
              pinned={sidebarPinned}
              threadId={threadId}
              threadListMode="hidden"
              threads={threads}
            />

            <MainWorkspace>
              <WritingWorkspace
                onPrefillComposer={onPrefillComposer}
                onSaveStatusChange={setWritingSaveStatus}
              />
            </MainWorkspace>

            <DashboardStatusBar
              isWritingMode
              statusLabel={
                writingSaveStatus
                  ? formatWritingBarLabel(writingSaveStatus)
                  : "已保存"
              }
            />
            </WritingLibraryFiltersProvider>
          </WritingDocumentsProvider>
        </WritingLayoutProvider>
      ) : (
        <>
          <SidebarNav
            activeMode={activeMode}
            hoverExpanded={sidebarHoverExpanded}
            onArchiveThread={onArchiveThread}
            onDeleteThread={onDeleteThread}
            onHoverExpandedChange={setSidebarHoverExpanded}
            onLoadThread={onLoadThread}
            onModeChange={handleModeChange}
            onNewThread={handleNewThread}
            onPinnedChange={handleSidebarPinnedChange}
            pinned={sidebarPinned}
            threadId={threadId}
            threadListMode={activeMode === "agent" ? "full" : "hidden"}
            threads={threads}
          />

          <MainWorkspace>
            {activeMode === "schedule" ? (
              <ScheduleMonthView
                onBackToWorkbench={() => setActiveMode("agent")}
                threadId={threadId}
                isSubmitting={isSubmitting}
                navigationTarget={
                  linkedObjectNavigationTarget?.type === "schedule"
                    ? linkedObjectNavigationTarget
                    : null
                }
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
                navigationTarget={
                  linkedObjectNavigationTarget?.type === "checklist"
                    ? linkedObjectNavigationTarget
                    : null
                }
              />
            ) : activeMode === "timeline" ? (
              <TimelineView
                onBackToWorkbench={() => setActiveMode("agent")}
                threadId={threadId}
                navigationTarget={
                  linkedObjectNavigationTarget?.type === "timeline"
                    ? linkedObjectNavigationTarget
                    : null
                }
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
            lastExecutedAction={lastExecutedAction}
            activeInspectorTab={activeInspectorTab}
            artifactsRollbackBusy={artifactsRollbackBusy}
            artifactsRollbackError={artifactsRollbackError}
            contextPreferences={contextPreferences}
            debugMode={debugMode}
            inputTokenEstimate={inputTokenEstimate}
            latestAssistantMessage={latestAssistantMessage}
            linkedObjectNavigationTarget={
              linkedObjectNavigationTarget?.type === "plan"
                ? linkedObjectNavigationTarget
                : null
            }
            lastRollbackSourceRunId={lastRollbackSourceRunId}
            lastRollbackResult={lastRollbackResult}
            messages={messages}
            onResizeStart={handleResizeStart}
            onArtifactsRollback={onArtifactsRollback}
            onInspectorTabChange={handleInspectorTabChange}
            onPlanOperatingPrompt={onRunPrompt}
            onPrefillComposer={onPrefillComposer}
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
            turnAudit={turnAudit ?? null}
            workbenchMode={workbenchMode}
          />

          {activeMode !== "agent" ? (
            <button
              type="button"
              className="sunny-dashboard-inspector-toggle"
              aria-label={panelOpen ? "收起检查器" : "展开检查器"}
              title={panelOpen ? "收起检查器" : "展开检查器"}
              onClick={handleTogglePanel}
            >
              <InspectorPanelIcon open={panelOpen} />
            </button>
          ) : null}

          {activeMode !== "schedule" ? (
            <DashboardStatusBar statusLabel={statusLabel} />
          ) : null}
        </>
      )}
    </AppShell>
    </LinkedObjectNavigationProvider>
  );
}
