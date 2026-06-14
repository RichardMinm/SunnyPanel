"use client";

import { inspectorTabs } from "@/components/dashboard/agent/constants";
import { DashboardIcon } from "@/components/dashboard/icons";
import type { AgentInspectorTab } from "@/components/dashboard/agent/types";
import type { PendingAction } from "@/lib/agent/schemas";

type InspectorTabBarProps = {
  activeTab: AgentInspectorTab;
  debugMode?: boolean;
  onTabChange: (tab: AgentInspectorTab) => void;
  pendingAction?: null | PendingAction;
};

export function InspectorTabBar({ activeTab, debugMode = false, onTabChange, pendingAction }: InspectorTabBarProps) {
  const hasApprovalBadge = pendingAction?.type === "await_confirmation";

  const visibleTabs = inspectorTabs.filter((tab) => {
    // Always show primary context/memory/linked
    if (tab.key === "context" || tab.key === "memory" || tab.key === "linked") return true;
    // Show approval only when there's a pending action
    if (tab.key === "approval") return pendingAction != null;
    // Show trace and review only in debug mode
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
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            title={tab.label}
            className={[isActive ? "active is-active" : "", showBadge ? "has-badge" : ""].filter(Boolean).join(" ")}
            onClick={() => onTabChange(tab.key)}
          >
            <DashboardIcon name={tab.icon} />
          </button>
        );
      })}
    </div>
  );
}
