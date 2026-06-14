"use client";

import { inspectorTabs } from "@/components/dashboard/agent/constants";
import { DashboardIcon } from "@/components/dashboard/icons";
import type { PendingAction } from "@/lib/agent/schemas";

import type { AgentInspectorTab } from "./types";

type InspectorTabBarProps = {
  activeTab: AgentInspectorTab;
  debugMode?: boolean;
  onTabChange: (tab: AgentInspectorTab) => void;
  pendingAction?: null | PendingAction;
};

export function InspectorTabBar({
  activeTab,
  debugMode = false,
  onTabChange,
  pendingAction,
}: InspectorTabBarProps) {
  const hasApprovalBadge = pendingAction?.type === "await_confirmation";
  const visibleTabs = inspectorTabs.filter((tab) => {
    if (tab.key === "context" || tab.key === "memory" || tab.key === "linked") return true;
    if (tab.key === "approval") return pendingAction != null;
    if (tab.key === "trace" || tab.key === "review") return debugMode;
    return false;
  });

  return (
    <div className="sunny-inspector-tab-bar sunny-agent-inspector-tabs sunny-dashboard-right-tabs" role="tablist" aria-label="上下文面板导航">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const showBadge = tab.key === "approval" && hasApprovalBadge;

        return (
          <button
            aria-label={tab.label}
            aria-selected={isActive}
            className={[isActive ? "active is-active" : "", showBadge ? "has-badge" : ""].filter(Boolean).join(" ")}
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            role="tab"
            title={tab.label}
            type="button"
          >
            <DashboardIcon name={tab.icon} />
          </button>
        );
      })}
    </div>
  );
}
