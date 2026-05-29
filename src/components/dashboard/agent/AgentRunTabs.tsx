import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { AgentWorkbenchTab } from "./types";

const runTabItems: Array<{ key: AgentWorkbenchTab; label: string }> = [
  { key: "timeline", label: "Run" },
  { key: "conversation", label: "Conversation" },
];

type AgentRunTabsProps = {
  activeTab: AgentWorkbenchTab;
  onActiveTabChange: (tab: AgentWorkbenchTab) => void;
};

export function AgentRunTabs({ activeTab, onActiveTabChange }: AgentRunTabsProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = runTabItems.findIndex((item) => item.key === activeTab);

    if (currentIndex < 0) return;

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % runTabItems.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + runTabItems.length) % runTabItems.length;
    } else {
      return;
    }

    event.preventDefault();
    onActiveTabChange(runTabItems[nextIndex].key);
    (event.currentTarget.querySelectorAll("[role=tab]")[nextIndex] as HTMLElement | null)?.focus();
  };

  return (
    <div className="sunny-agent-run-tabs" role="tablist" aria-label="Agent run view" onKeyDown={handleKeyDown}>
      {runTabItems.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeTab === item.key}
          tabIndex={activeTab === item.key ? 0 : -1}
          className={activeTab === item.key ? "active" : ""}
          onClick={() => onActiveTabChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
