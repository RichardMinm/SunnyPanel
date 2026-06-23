"use client";

/**
 * Agent-mode inspector tabs. Writing mode uses WritingMetaPanel instead —
 * both are intentional parallel inspector UIs for their respective workspaces.
 */

import { inspectorTabs } from "@/components/dashboard/agent/constants";
import { DashboardIcon } from "@/components/dashboard/icons";
import { AppTabs, AppTabsList, AppTabsTrigger } from "@/components/primitives/AppTabs";
import type { PendingAction } from "@/lib/agent/schemas";

import type { AgentInspectorTab } from "./types";

type ContextInspectorProps = {
  activeTab: AgentInspectorTab;
  bare?: boolean;
  debugMode?: boolean;
  onTabChange: (tab: AgentInspectorTab) => void;
  pendingAction?: null | PendingAction;
};

export function ContextInspector({
  activeTab,
  bare = false,
  debugMode = false,
  onTabChange,
  pendingAction,
}: ContextInspectorProps) {
  const hasApprovalBadge = pendingAction?.type === "await_confirmation";
  const visibleTabs = inspectorTabs.filter((tab) => {
    if (tab.key === "context" || tab.key === "memory" || tab.key === "linked" || tab.key === "inbox") return true;
    if (tab.key === "approval") return pendingAction != null;
    if (tab.key === "trace") return debugMode;
    if (tab.key === "debug") return debugMode;
    return false;
  });

  const tabTriggers = visibleTabs.map((tab) => {
    const showBadge = tab.key === "approval" && hasApprovalBadge;

    return (
      <AppTabsTrigger
        key={tab.key}
        aria-label={tab.label}
        className={[
          "sunny-inspector-tab-trigger",
          showBadge ? "has-badge" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={tab.label}
        value={tab.key}
      >
        <DashboardIcon name={tab.icon} />
      </AppTabsTrigger>
    );
  });

  const tabsList = (
    <AppTabsList
      aria-label="上下文面板导航"
      className="sunny-inspector-tab-bar sunny-agent-inspector-tabs sunny-dashboard-right-tabs"
    >
      {tabTriggers}
    </AppTabsList>
  );

  if (bare) {
    return (
      <AppTabs onValueChange={(value) => onTabChange(value as AgentInspectorTab)} value={activeTab}>
        {tabsList}
      </AppTabs>
    );
  }

  return (
    <AppTabs onValueChange={(value) => onTabChange(value as AgentInspectorTab)} value={activeTab}>
      {tabsList}
    </AppTabs>
  );
}

export function getInspectorTabLabel(tab: AgentInspectorTab) {
  return inspectorTabs.find((entry) => entry.key === tab)?.label ?? "上下文";
}
