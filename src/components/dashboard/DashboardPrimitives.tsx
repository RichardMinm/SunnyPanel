import Link from "next/link";

import { StatusBadge, type StatusBadgeTone } from "@/components/ui/SunnyComponents";

export function FocusActionCard({
  actionLabel,
  compact = false,
  href,
  index,
  strong = false,
  summary,
  title,
  tone,
}: {
  actionLabel: string;
  compact?: boolean;
  href: string;
  index?: number;
  strong?: boolean;
  summary: string;
  title: string;
  tone: StatusBadgeTone;
}) {
  return (
    <Link
      href={href}
      className={`sunny-focus-action ${strong ? "sunny-focus-action-primary" : ""} ${compact ? "sunny-focus-action-compact" : ""}`}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {typeof index === "number" ? (
              <span className="sunny-dashboard-count">{String(index + 1).padStart(2, "0")}</span>
            ) : null}
            <StatusBadge tone={tone}>{actionLabel}</StatusBadge>
          </div>
          <h3 className={`sunny-dashboard-title font-semibold text-foreground ${compact ? "mt-2 text-sm" : "mt-3 text-base"}`}>
            {title}
          </h3>
          <p className={`sunny-dashboard-clamp text-muted ${compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6"}`}>
            {summary}
          </p>
        </div>
        <span className="sunny-focus-action-arrow" aria-hidden>
          →
        </span>
      </div>
    </Link>
  );
}
