"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type { TaskNode } from "@/lib/agent/orchestration/types";

import { AgentApprovalPanel } from "./AgentApprovalPanel";
import { AgentContextPanel } from "./AgentContextPanel";
import { AgentTracePanel } from "./AgentTracePanel";
import { inspectorTabs } from "./constants";
import type { AgentInspectorTab, ContextPreferences } from "./types";

type AgentInspectorTabsProps = {
  activeTab: AgentInspectorTab;
  onActiveTabChange: (tab: AgentInspectorTab) => void;
  panelIdPrefix: string;
  tabListId: string;
};

export function AgentInspectorTabs({ activeTab, onActiveTabChange, panelIdPrefix, tabListId }: AgentInspectorTabsProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = inspectorTabs.findIndex((tab) => tab.key === activeTab);

    if (currentIndex < 0) return;

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % inspectorTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + inspectorTabs.length) % inspectorTabs.length;
    } else {
      return;
    }

    event.preventDefault();
    onActiveTabChange(inspectorTabs[nextIndex].key);
    (event.currentTarget.querySelectorAll("[role=tab]")[nextIndex] as HTMLElement | null)?.focus();
  };

  return (
    <div className="sunny-agent-inspector-tabs" id={tabListId} role="tablist" aria-label="Agent 详情面板" onKeyDown={handleKeyDown}>
      {inspectorTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          aria-controls={`${panelIdPrefix}-${tab.key}`}
          tabIndex={activeTab === tab.key ? 0 : -1}
          className={activeTab === tab.key ? "active" : ""}
          onClick={() => onActiveTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

type AgentInspectorProps = {
  action: null | ProposedAgentAction;
  activeTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  compact?: boolean;
  contextPreferences?: ContextPreferences;
  dagCompletedTasks?: Set<string>;
  dagConflicts?: [string, string][];
  dagExecutingTaskId?: null | string;
  dagFailedTasks?: Set<string>;
  dagTasks?: TaskNode[];
  drawer?: boolean;
  inputTokenEstimate: number;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackPayload?: null | unknown;
  messages: AgentChatMessage[];
  onActiveTabChange: (tab: AgentInspectorTab) => void;
  onArtifactsRollback?: () => void;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
};

const emptyPreferences: ContextPreferences = { excluded: [], pinned: [] };
const noop = () => undefined;

function InspectorPanels({
  action,
  activeTab,
  contextPreferences,
  messages,
  onToggleContextExclude,
  onToggleContextPin,
  panelIdPrefix,
  pendingAction,
  statusLabel,
  tabListId,
  threadId,
  traceSteps,
}: Omit<AgentInspectorProps, "drawer"> & { panelIdPrefix: string; tabListId: string }) {
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          role="tabpanel"
          id={`${panelIdPrefix}-${activeTab}`}
          aria-labelledby={tabListId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "context" ? (
            <AgentContextPanel
              contextPreferences={contextPreferences ?? emptyPreferences}
              messages={messages}
              onToggleExclude={onToggleContextExclude ?? noop}
              onTogglePin={onToggleContextPin ?? noop}
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              threadId={threadId}
              traceSteps={traceSteps}
            />
          ) : null}
          {activeTab === "approval" ? <AgentApprovalPanel action={action} pendingAction={pendingAction} /> : null}
          {activeTab === "trace" ? <AgentTracePanel statusLabel={statusLabel} traceSteps={traceSteps} /> : null}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export function AgentInspector({
  action,
  activeTab,
  artifactsRollbackBusy,
  artifactsRollbackError,
  compact = false,
  contextPreferences,
  dagCompletedTasks,
  dagConflicts,
  dagExecutingTaskId,
  dagFailedTasks,
  dagTasks,
  drawer = false,
  inputTokenEstimate,
  latestAssistantMessage,
  lastRollbackPayload,
  messages,
  onActiveTabChange,
  onArtifactsRollback,
  onToggleContextExclude,
  onToggleContextPin,
  pendingAction,
  statusLabel,
  threadId,
  tokenUsage,
  traceSteps,
}: AgentInspectorProps) {
  const tabListId = useId();
  const panelIdPrefix = `${tabListId}-panel`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const currentTabLabel = inspectorTabs.find((tab) => tab.key === activeTab)?.label ?? "Context";

  useEffect(() => {
    if (!drawer || !drawerOpen) {
      return;
    }

    const panel = drawerRef.current;

    if (panel) {
      const firstFocusable = panel.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");

      firstFocusable?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        triggerRef.current?.focus();

        return;
      }

      if (event.key === "Tab" && panel) {
        const focusable = panel.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawer, drawerOpen]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    triggerRef.current?.focus();
  }, []);

  const panelsNode = (
    <InspectorPanels
      action={action}
      activeTab={activeTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      dagCompletedTasks={dagCompletedTasks}
      dagConflicts={dagConflicts}
      dagExecutingTaskId={dagExecutingTaskId}
      dagFailedTasks={dagFailedTasks}
      dagTasks={dagTasks}
      inputTokenEstimate={inputTokenEstimate}
      latestAssistantMessage={latestAssistantMessage}
      lastRollbackPayload={lastRollbackPayload}
      messages={messages}
      onActiveTabChange={onActiveTabChange}
      onArtifactsRollback={onArtifactsRollback}
      onToggleContextExclude={onToggleContextExclude}
      onToggleContextPin={onToggleContextPin}
      panelIdPrefix={panelIdPrefix}
      pendingAction={pendingAction}
      statusLabel={statusLabel}
      tabListId={tabListId}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
    />
  );

  if (compact) {
    return (
      <aside className={`sunny-agent-inspector-compact${compactOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="sunny-agent-inspector-compact-header"
          aria-expanded={compactOpen}
          onClick={() => setCompactOpen((v) => !v)}
        >
          <span className="sunny-agent-inspector-compact-label">检查器</span>
          <span className="sunny-agent-inspector-compact-tab">{currentTabLabel}</span>
          <span className="sunny-agent-inspector-compact-chevron" aria-hidden="true">{compactOpen ? "▾" : "▸"}</span>
        </button>
        {compactOpen ? (
          <div className="sunny-agent-inspector-compact-body">
            <AgentInspectorTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} panelIdPrefix={panelIdPrefix} tabListId={tabListId} />
            {panelsNode}
          </div>
        ) : null}
      </aside>
    );
  }

  const shell = (
    <aside className="sunny-agent-inspector-shell">
      <div className="sunny-agent-inspector-head">
        <div>
          <p>检查器</p>
          <h2>{currentTabLabel}</h2>
        </div>
      </div>
      <AgentInspectorTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} panelIdPrefix={panelIdPrefix} tabListId={tabListId} />
      {panelsNode}
    </aside>
  );

  if (!drawer) {
    return shell;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sunny-agent-inspector-drawer-trigger"
        aria-expanded={drawerOpen}
        aria-controls="agent-inspector-drawer-panel"
        onClick={() => setDrawerOpen((open) => !open)}
      >
        检查器
      </button>
      {drawerOpen ? (
        <>
          <div
            className="sunny-agent-inspector-drawer-backdrop"
            role="presentation"
            aria-hidden
            onClick={closeDrawer}
          />
          <div ref={drawerRef} id="agent-inspector-drawer-panel" className="sunny-agent-inspector-drawer is-open" role="dialog" aria-label="检查器面板">
            {shell}
          </div>
        </>
      ) : null}
    </>
  );
}
