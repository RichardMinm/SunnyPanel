/** Admin 侧栏分组键（与 site-copy admin.groups 对应） */
export const ADMIN_NAV_GROUP = {
  agent: "agent",
  content: "content",
  planning: "planning",
  settings: "settings",
  system: "system",
} as const;

export type AdminNavGroupKey = (typeof ADMIN_NAV_GROUP)[keyof typeof ADMIN_NAV_GROUP];

export function withAdminNavGroup(group: AdminNavGroupKey) {
  return { group };
}
