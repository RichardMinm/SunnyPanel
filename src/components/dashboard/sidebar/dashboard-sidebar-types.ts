import type { AgentThreadSummary } from "@/components/dashboard/agent/types";

export type DashboardIconMode =
  | "agent"
  | "checklist"
  | "memory"
  | "plans"
  | "schedule"
  | "timeline"
  | "today"
  | "writing";

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  hoverExpanded: boolean;
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
  onHoverExpandedChange: (expanded: boolean) => void;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onPinnedChange: (pinned: boolean) => void;
  pinned: boolean;
  threadId: null | number;
  threadListMode?: "compact" | "full" | "hidden";
  threads: AgentThreadSummary[];
};
