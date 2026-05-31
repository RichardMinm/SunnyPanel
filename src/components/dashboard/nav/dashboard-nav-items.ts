import type { DashboardNavSection } from "@/lib/dashboard/placeholder-interfaces";

export const workspaceNavSections: DashboardNavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "ws-plans", label: "计划", href: "/admin/collections/plans" },
      { id: "ws-schedule", label: "日程", href: "/admin/collections/schedule-items" },
      { id: "ws-writing", label: "写作", href: "/admin/collections/posts" },
      { id: "ws-notes", label: "笔记", href: "/notes" },
      { id: "ws-timeline", label: "时间线", href: "/timeline" },
      { id: "ws-memory", label: "记忆", href: "/admin/collections/agent-memories" },
    ],
  },
];
