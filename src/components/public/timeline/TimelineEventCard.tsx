import Link from "next/link";

import type { TimelineEvent } from "@/payload-types";

import { StatusBadge } from "@/components/ui/SunnyComponents";
import { formatDate, formatShortDate } from "@/lib/formatters";
import { getTimelineMonthLabel } from "@/lib/timeline/public-timeline";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type TimelineEventCardProps = {
  event: TimelineEvent;
  locale: SiteLocale;
};

export function TimelineEventCard({ event, locale }: TimelineEventCardProps) {
  const copy = getSiteCopy(locale);
  const timelineCopy = copy.timeline;
  const relatedLinks: Array<{ href: string; label: string }> = [];

  if (typeof event.relatedPost === "object" && event.relatedPost?.slug) {
    relatedLinks.push({ href: `/blog/${event.relatedPost.slug}`, label: copy.common.relatedPost });
  }

  if (typeof event.relatedUpdate === "object" && event.relatedUpdate?.id) {
    relatedLinks.push({ href: "/updates", label: copy.common.relatedUpdates });
  }

  if (typeof event.relatedChecklist === "object" && event.relatedChecklist?.id) {
    relatedLinks.push({ href: "/checklists", label: timelineCopy.viewChecklist });
  }

  return (
    <article
      className={`relative rounded-[1rem] border border-border px-4 py-4 md:px-5 md:py-5 ${
        event.isFeatured ? "bg-white/68 shadow-[inset_3px_0_0_var(--accent)]" : "bg-white/42"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="accent">{event.type}</StatusBadge>
            {event.isFeatured ? <StatusBadge tone="info">{copy.common.featured}</StatusBadge> : null}
            <span className="text-sm text-muted">{formatDate(event.eventDate, locale)}</span>
          </div>
          <h3 className="mt-3 text-xl font-semibold leading-snug text-foreground">{event.title}</h3>
        </div>
        <span className="sunny-dashboard-count">{getTimelineMonthLabel(event.eventDate, locale)}</span>
      </div>

      <p className="mt-3 text-sm leading-7 text-muted">{event.description || timelineCopy.nodeFallback}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-accent-strong">
        <span>{formatShortDate(event.eventDate, locale)}</span>
        {relatedLinks.map((link) => (
          <Link key={`${event.id}-${link.href}`} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
