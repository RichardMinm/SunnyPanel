import type { DashboardIconName } from "@/components/dashboard/icons";
import type { DashboardIconMode } from "./dashboard-sidebar-types";

export type DashboardModeConfig = {
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
};

/**
 * Dashboard sidebar mode navigation entries.
 * Order defines the sidebar display order.
 * Writing mode has special sidebar layout (see isWritingMode check in DashboardIconBar).
 */
export const DASHBOARD_MODES: DashboardModeConfig[] = [
  { key: "agent", label: "工作台", icon: "agent", prompt: "" },
  { key: "schedule", label: "日程", icon: "calendar", prompt: "帮我查看最近的日程安排" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
  { key: "writing", label: "写作", icon: "pencil", prompt: "" },
  { key: "checklist", label: "清单", icon: "checklist", prompt: "" },
  { key: "timeline", label: "时间线", icon: "timeline", prompt: "" },
];
