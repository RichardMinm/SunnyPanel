import type { AdminNavGroupKey } from "@/lib/payload/admin-groups";
import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";

export function getAdminNavGroupLabel(locale: SiteLocale, groupKey: string): string {
  const groups = getSiteCopy(locale).admin.groups;
  const key = groupKey as AdminNavGroupKey;

  if (key in groups) {
    return groups[key as keyof typeof groups];
  }

  return groupKey;
}

export function getAdminWorkspaceCopy(locale: SiteLocale) {
  const copy = getSiteCopy(locale).admin;

  return {
    advancedDescription: copy.advancedDescription,
    advancedManagement: copy.advancedManagement,
    backToDashboard: copy.backToDashboard,
    dailyWork: copy.dailyWork,
    writingStudio: copy.writingStudio,
    workspace: copy.workspace,
  };
}
