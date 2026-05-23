import { formatDateKey } from "@/components/dashboard/calendar-utils";

export type DashboardHrefParams = {
  threadId?: number | null;
  week?: Date | string | null;
};

export function buildDashboardHref({ threadId, week }: DashboardHrefParams = {}): string {
  const search = new URLSearchParams();

  if (week) {
    search.set("week", typeof week === "string" ? week : formatDateKey(week));
  }

  if (threadId != null) {
    search.set("threadId", String(threadId));
  }

  const query = search.toString();

  return query ? `/dashboard?${query}` : "/dashboard";
}
