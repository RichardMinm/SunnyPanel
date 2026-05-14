import Link from "next/link";

import { EmptyState, StatusBadge } from "@/components/ui/SunnyComponents";
import { formatDateTime } from "@/lib/formatters";
import type { SiteLocale } from "@/lib/site-copy";

import {
  relationLabelMap,
  relationToneMap,
  type QueueDescriptor,
  visibilityMetaMap,
} from "./dashboard-page-constants";

export function DashboardContentQueueCard({
  actionHref,
  actionLabel,
  empty,
  items,
  kicker,
  locale,
  title,
}: QueueDescriptor & { locale: SiteLocale }) {
  return (
    <div className="sunny-content-operation-lane">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="sunny-kicker text-[0.68rem] text-muted">{kicker}</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
        </div>
        <span className="sunny-dashboard-count">{items.length}</span>
      </div>

      <div className="sunny-dashboard-list mt-4">
        {items.length > 0 ? (
          items.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={item.href}
              className="sunny-dashboard-row sunny-content-operation-row"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h4 className="sunny-dashboard-title text-sm font-semibold text-foreground">{item.title}</h4>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone={relationToneMap[item.kind] ?? "neutral"}>{relationLabelMap[item.kind]}</StatusBadge>
                  <StatusBadge tone={visibilityMetaMap[item.visibility].tone}>{visibilityMetaMap[item.visibility].label}</StatusBadge>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">更新：{formatDateTime(item.updatedAt, locale)}</p>
            </Link>
          ))
        ) : (
          <EmptyState>{empty}</EmptyState>
        )}
      </div>

      <div className="mt-3">
        <Link className="sunny-dashboard-link" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
