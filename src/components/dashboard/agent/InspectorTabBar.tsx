"use client";

import type { PendingAction } from "@/lib/agent/schemas";
import { InspectorTabIcon } from "@/components/dashboard/icons";

import { inspectorTabs } from "./constants";
import type { AgentInspectorTab } from "./types";

type InspectorTabBarProps = {
  activeTab: AgentInspectorTab;
  onTabChange: (tab: AgentInspectorTab) => void;
  pendingAction: null | PendingAction;
};

export function InspectorTabBar({
  activeTab,
  onTabChange,
  pendingAction,
}: InspectorTabBarProps) {
  return (
    <div className="sunny-inspector-tab-bar sunny-dashboard-right-tabs" role="tablist" aria-label="检查器视图">
      {inspectorTabs.map((tab) => {
        const active = tab.key === activeTab;
        const hasBadge = tab.key === "approval" && Boolean(pendingAction);

        return (
          <button
            aria-label={tab.label}
            aria-selected={active}
            className={`${active ? "is-active" : ""}${hasBadge ? " has-badge" : ""}`.trim()}
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            role="tab"
            title={tab.label}
            type="button"
          >
            <InspectorTabIcon tab={tab.key} />
          </button>
        );
      })}
    </div>
  );
}
