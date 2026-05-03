import Link from "next/link";

import type { TimelineEvent } from "@/payload-types";

import { EmptyState, SectionHeader, StatusBadge, SurfaceCard, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import type { SiteLocale } from "@/lib/site-copy";

type TimelineHighlightProps = {
  events: TimelineEvent[];
  locale: SiteLocale;
};

const getHighlightCopy = (locale: SiteLocale) => ({
  action: locale === "en" ? "Open Timeline" : "打开时间线",
  description:
    locale === "en"
      ? "Featured milestones keep the public site connected to writing, updates, and long-term progress."
      : "精选节点把公开写作、动态和长期进展串成一条能回看的个人线索。",
  emptyBody:
    locale === "en"
      ? "Mark a public Timeline event as featured and it will become the homepage memory anchor."
      : "把公开 Timeline 节点标记为精选后，它会成为首页的记忆锚点。",
  emptyTitle: locale === "en" ? "No featured memory yet" : "还没有精选记忆",
  kicker: locale === "en" ? "Memory Backbone" : "记忆骨架",
  latest: locale === "en" ? "Featured" : "精选",
  more: locale === "en" ? "More memory nodes" : "更多记忆节点",
  title: locale === "en" ? "Timeline Highlights" : "时间线精选",
});

export function TimelineHighlight({ events, locale }: TimelineHighlightProps) {
  const copy = getHighlightCopy(locale);
  const [primaryEvent, ...supportingEvents] = events;

  return (
    <SurfaceCard as="section" variant="strong">
      <SectionHeader
        action={
          <Link href="/timeline" className="sunny-button-secondary">
            {copy.action}
          </Link>
        }
        description={copy.description}
        kicker={copy.kicker}
        size="lg"
        title={copy.title}
      />

      {primaryEvent ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
          <Link
            href="/timeline?featured=1"
            className="block rounded-[1rem] border border-border bg-white/58 px-5 py-5 transition hover:-translate-y-1 hover:bg-white/72 md:px-6 md:py-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge size="md" tone="accent">
                {copy.latest}
              </StatusBadge>
              <StatusBadge size="md" tone="info">
                {primaryEvent.type}
              </StatusBadge>
              <span className="text-sm text-muted">{formatShortDate(primaryEvent.eventDate, locale)}</span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold leading-tight text-foreground md:text-3xl">
              {primaryEvent.title}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {primaryEvent.description ||
                (locale === "en"
                  ? "This milestone is part of the long-term SunnyPanel narrative."
                  : "这条节点属于 SunnyPanel 长期叙事中的一个重要锚点。")}
            </p>
          </Link>

          <div className="rounded-[1rem] border border-border bg-white/32 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="sunny-kicker text-[0.68rem] text-muted">{copy.more}</p>
              <span className="sunny-dashboard-count">{supportingEvents.length}</span>
            </div>
            <div className="mt-2">
              {supportingEvents.length > 0 ? (
                supportingEvents.map((event) => (
                  <TimelineMiniCard
                    key={event.id}
                    date={formatShortDate(event.eventDate, locale)}
                    description={event.description ?? undefined}
                    href="/timeline?featured=1"
                    title={event.title}
                    type={event.type}
                    variant="rail"
                  />
                ))
              ) : (
                <EmptyState description={copy.emptyBody} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState description={copy.emptyBody} title={copy.emptyTitle} />
        </div>
      )}
    </SurfaceCard>
  );
}
