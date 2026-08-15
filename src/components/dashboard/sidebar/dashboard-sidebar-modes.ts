import type { DashboardIconName } from "@/components/dashboard/icons";
import type { DashboardIconMode } from "./dashboard-sidebar-types";

export type DashboardModeConfig = {
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
};

/**
 * Dashboard sidebar mode navigation entries.
 * Order defines the sidebar display order.
 * Writing mode has special sidebar layout (see isWritingMode check in DashboardIconBar).
 */
export const DASHBOARD_MODES: DashboardModeConfig[] = [
  { key: "agent", label: "工作台", icon: "agent" },
  { key: "schedule", label: "日程", icon: "calendar" },
  { key: "memory", label: "记忆库", icon: "memory" },
  { key: "writing", label: "写作", icon: "pencil" },
  { key: "checklist", label: "清单", icon: "checklist" },
  { key: "timeline", label: "时间线", icon: "timeline" },
];
