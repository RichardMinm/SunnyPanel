import type { ReactNode } from "react";

import type { AgentInspectorTab } from "@/components/dashboard/agent/types";

export type DashboardIconName =
  | "agent"
  | "archive"
  | "calendar"
  | "checklist"
  | "chevronDown"
  | "command"
  | "debug"
  | "document"
  | "inbox"
  | "inspectorPanel"
  | "memory"
  | "moreHorizontal"
  | "new"
  | "note"
  | "pencil"
  | "pin"
  | "plans"
  | "post"
  | "project"
  | "review"
  | "schedule"
  | "search"
  | "settings"
  | "sparkle"
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "layers"
  | "plus"
  | "thinking"
  | "timeline";

const ICON_PATHS: Record<DashboardIconName, ReactNode> = {
  agent: (
    <>
      <path d="M4.75 5.5h10.5v9H4.75z" />
      <path d="M7.2 9h.05M10 9h.05M12.8 9h.05M7.5 12h5" />
    </>
  ),
  archive: (
    <>
      <path d="M4.75 5.75h10.5v9.5H4.75z" />
      <path d="M7.25 5.75v-1.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v1.5" />
      <path d="M4.75 9.25h10.5" />
    </>
  ),
  calendar: (
    <>
      <path d="M5.25 4.75h9.5v10.5h-9.5zM7.25 3.75v2M12.75 3.75v2M5.25 8h9.5" />
      <path d="M8 10.75h.05M10 10.75h.05M12 10.75h.05M8 12.75h.05M10 12.75h.05" />
    </>
  ),
  checklist: (
    <>
      <path d="M5.25 5.25h9.5v9.5h-9.5z" />
      <path d="m7.75 9.5 1.5 1.5 3-3" />
    </>
  ),
  command: (
    <>
      <path d="M7.25 7.25h5.5v5.5h-5.5z" />
      <path d="M7.25 7.25H6a1.75 1.75 0 1 1 1.75-1.75v1.75M12.75 7.25V5.5a1.75 1.75 0 1 1 1.75 1.75h-1.75M12.75 12.75H14a1.75 1.75 0 1 1-1.75 1.75v-1.75M7.25 12.75v1.75A1.75 1.75 0 1 1 5.5 12.75h1.75" />
    </>
  ),
  debug: (
    <>
      <path d="M6.5 6.5 4.75 4.75M13.5 6.5 15.25 4.75M6.5 13.5 4.75 15.25M13.5 13.5 15.25 15.25" />
      <path d="M10 5.25v1.25M10 13.5v1.25M5.25 10h1.25M13.5 10h1.25" />
      <path d="M8.25 8.25h3.5v3.5H8.25z" />
    </>
  ),
  document: (
    <>
      <path d="M6.25 4.25h4.5l3 3v8.5h-7.5z" />
      <path d="M10.75 4.25v3h3M7.5 9.75h5M7.5 12.25h3.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4.5 4.75h11v10.5h-11z" />
      <path d="M4.5 11h3l1.5 2h2l1.5-2h3" />
    </>
  ),
  inspectorPanel: (
    <>
      <path d="M4.75 5.25h10.5v9.5H4.75z" />
      <path d="M11.25 5.25v9.5" />
    </>
  ),
  memory: (
    <>
      <path d="M10 4.5a3.5 3.5 0 0 0-3.5 3.5v4.5a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V8A3.5 3.5 0 0 0 10 4.5Z" />
      <path d="M6.5 8h7M6.5 11h7M8.25 4.9v9.2M11.75 4.9v9.2" />
    </>
  ),
  moreHorizontal: (
    <>
      <circle cx="6" cy="10" r="1.1" />
      <circle cx="10" cy="10" r="1.1" />
      <circle cx="14" cy="10" r="1.1" />
    </>
  ),
  new: (
    <>
      <path d="M5 14.5 14.5 5M8 5h6.5v6.5" />
      <path d="M4.5 5.5v10h10" />
    </>
  ),
  note: (
    <>
      <path d="M6.25 4.25h5l2.5 2.5v8.5h-7.5z" />
      <path d="M7.5 8.75h5M7.5 11.25h3.5" />
    </>
  ),
  pencil: (
    <>
      <path d="m5 13.75.8-3.05 6.6-6.6a1.55 1.55 0 0 1 2.2 2.2l-6.6 6.6-3 .85Z" />
      <path d="m11.5 5.05 2.45 2.45" />
    </>
  ),
  pin: (
    <path d="M10 2.5 8.25 6.5v6.5l-2.5 4h8.5l-2.5-4V6.5L10 2.5Z" />
  ),
  plans: (
    <>
      <path d="M5.25 4.75h9.5v10.5h-9.5z" />
      <path d="M7.4 7.25h5.2M7.4 10h5.2M7.4 12.75h3.2" />
    </>
  ),
  post: (
    <>
      <path d="M5.75 4.25h8.5v11.5h-8.5z" />
      <path d="M7.5 7.25h5M7.5 9.75h5M7.5 12.25h2" />
    </>
  ),
  project: (
    <>
      <path d="M4.75 6.25h4.1l1.2 1.5h5.2v7H4.75z" />
      <path d="M4.75 8.25h10.5" />
    </>
  ),
  review: (
    <>
      <path d="M7.25 4.25h5.5a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H7.25a1 1 0 0 1-1-1V5.25a1 1 0 0 1 1-1Z" />
      <path d="M8.5 4.25v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1" />
      <path d="m7.75 10.25 1.5 1.5 3-3" />
      <path d="M10.75 4.25v1" />
    </>
  ),
  schedule: (
    <>
      <path d="M10 15.25a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5Z" />
      <path d="M10 7.25v3.15l2.15 1.25" />
    </>
  ),
  search: (
    <>
      <path d="M9 13.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" />
      <path d="m12.25 12.25 3 3" />
    </>
  ),
  settings: (
    <>
      <path d="M10 12.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
      <path d="m10.65 4.45.45 1.25a4.9 4.9 0 0 1 1.05.45l1.25-.55 1 1.75-.95.85c.05.38.05.75 0 1.13l.95.85-1 1.75-1.25-.55c-.33.2-.68.35-1.05.45l-.45 1.25h-2l-.45-1.25a4.9 4.9 0 0 1-1.05-.45l-1.25.55-1-1.75.95-.85a4.7 4.7 0 0 1 0-1.13l-.95-.85 1-1.75 1.25.55c.33-.2.68-.35 1.05-.45l.45-1.25h2Z" />
    </>
  ),
  thinking: (
    <>
      <path d="M10 3.25a4.25 4.25 0 0 0-3.5 6.6c-.6.55-1 1.35-1 2.25a3.25 3.25 0 0 0 2.5 3.15v.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-.5a3.25 3.25 0 0 0 2.5-3.15c0-.9-.4-1.7-1-2.25A4.25 4.25 0 0 0 10 3.25Z" />
      <path d="M7.5 15.5h5M8.75 17.25h2.5" />
    </>
  ),
  timeline: (
    <>
      <path d="M10 4.25a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5Z" />
      <path d="M10 6.25v3.75l2.5 1.5" />
    </>
  ),
  chevronLeft: <path d="M13.5 4.5 7.5 10l6 5.5" />,
  chevronRight: <path d="M6.5 4.5 12.5 10l-6 5.5" />,
  chevronDown: <path d="M5.5 7.5 10 13l4.5-5.5" />,
  clock: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.25V10l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="M3 7.4 10 4l7 3.4" />
      <path d="M3 10.6 10 13l7-3.4" />
      <path d="M3 13.8 10 16l7-3.8" />
    </>
  ),
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  sparkle: (
    <path d="M10 2.5c.3 1.5.6 2.5 1.8 3.7C13 7.4 14 7.7 15.5 8c-1.5.3-2.5.6-3.7 1.8C10.6 11 10.3 12 10 13.5c-.3-1.5-.6-2.5-1.8-3.7C7 8.6 6 8.3 4.5 8c1.5-.3 2.5-.6 3.7-1.8C9.4 5 9.7 4 10 2.5Z" />
  ),
};

const INSPECTOR_TAB_ICONS: Record<AgentInspectorTab, DashboardIconName> = {
  approval: "checklist",
  context: "thinking",
  debug: "command",
  inbox: "inbox",
  linked: "project",
  memory: "memory",
  ops: "command",
  trace: "command",
};

/** 默认 viewBox 0-20, 1.45px stroke */
export function DashboardIcon({ name }: { name: DashboardIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="sunny-dashboard-nav-icon"
      viewBox="0 0 20 20"
      fill="none"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.45"
      >
        {ICON_PATHS[name]}
      </g>
    </svg>
  );
}

export function InspectorTabIcon({ tab }: { tab: AgentInspectorTab }) {
  return <DashboardIcon name={INSPECTOR_TAB_ICONS[tab]} />;
}

export function InspectorPanelIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="sunny-dashboard-nav-icon"
      viewBox="0 0 20 20"
      fill="none"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      >
        <path d="M4.75 5.25h10.5v9.5H4.75z" />
        <path d="M11.25 5.25v9.5" />
        {open ? <path d="m8.25 8 2 2-2 2" /> : <path d="m14 8-2 2 2 2" />}
      </g>
    </svg>
  );
}

/** Payload collection slug → icon name 映射 */
export const COLLECTION_ICON_MAP: Record<string, DashboardIconName> = {
  "agent-memories": "memory",
  checklists: "checklist",
  notes: "note",
  pages: "document",
  "plan-reviews": "review",
  plans: "plans",
  posts: "post",
  "schedule-items": "schedule",
  "timeline-events": "timeline",
  updates: "sparkle",
};

/** collection slug 默认图标 */
export const DEFAULT_COLLECTION_ICON: DashboardIconName = "document";
