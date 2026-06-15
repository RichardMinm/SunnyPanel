import { formatDateKey } from "@/components/dashboard/calendar-utils";

export type DashboardHrefParams = {
  mode?: null | string;
  threadId?: number | null;
  week?: Date | string | null;
};

export function buildDashboardHref({ mode, threadId, week }: DashboardHrefParams = {}): string {
  const search = new URLSearchParams();

  if (mode && mode !== "agent") {
    search.set("mode", mode);
  }

  if (week) {
    search.set("week", typeof week === "string" ? week : formatDateKey(week));
  }

  if (threadId != null) {
    search.set("threadId", String(threadId));
  }

  const query = search.toString();

  return query ? `/dashboard?${query}` : "/dashboard";
}
