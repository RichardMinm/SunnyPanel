import Link from "next/link";

import type { TimelineEvent } from "@/payload-types";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { EmptyState, SectionHeader, StatusBadge, SurfaceCard, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatDate, formatShortDate } from "@/lib/formatters";
import { getPublicTimelineEvents } from "@/lib/payload/public";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

export const dynamic = "force-dynamic";

type TimelineSearchParams = Promise<{
  featured?: string;
  type?: string;
  year?: string;
}>;

type TimelinePageProps = {
  searchParams: TimelineSearchParams;
};

type TimelineEventGroup = {
  events: TimelineEvent[];
  year: string;
};

const formatterLocales: Record<SiteLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
};

const buildTimelineHref = ({
  featured,
  type,
  year,
}: {
  featured?: boolean;
  type?: string;
  year?: string;
}) => {
  const params = new URLSearchParams();

  if (featured) {
    params.set("featured", "1");
  }

  if (type) {
    params.set("type", type);
  }

  if (year) {
    params.set("year", year);
  }

  const query = params.toString();

  return query ? `/timeline?${query}` : "/timeline";
};

const getMonthLabel = (value: string, locale: SiteLocale) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "en" ? "Unknown month" : "未知月份";
  }

  return new Intl.DateTimeFormat(formatterLocales[locale], {
    month: "long",
  }).format(date);
};

const groupEventsByYear = (events: TimelineEvent[]): TimelineEventGroup[] => {
  const groups = events.reduce<Record<string, TimelineEvent[]>>((accumulator, event) => {
    const groupYear = new Date(event.eventDate).getFullYear().toString();
    const existing = accumulator[groupYear] ?? [];

    accumulator[groupYear] = [...existing, event];
    return accumulator;
  }, {});

  return Object.keys(groups)
    .sort((left, right) => Number(right) - Number(left))
    .map((entryYear) => ({
      events: groups[entryYear],
      year: entryYear,
    }));
};

const getTimelineCopy = (locale: SiteLocale) => ({
  allEvents: locale === "en" ? "All events" : "全部节点",
  clear: locale === "en" ? "Clear filters" : "清除筛选",
  collapse: locale === "en" ? "Collapse" : "收起",
  description:
    locale === "en"
      ? "A public memory layer that connects writing, updates, projects, and long-term personal progress."
      : "这里不是活动日志，而是把公开写作、动态、项目和长期进展串起来的记忆层。",
  emptyFiltered:
    locale === "en"
      ? "No public memory node matches the current filters. Widen the view to recover the full narrative."
      : "当前筛选下没有公开记忆节点。放宽筛选后，可以回到完整叙事。",
  emptyPublic:
    locale === "en"
      ? "Publish a Timeline event when something becomes worth remembering. It will become part of the public memory backbone."
      : "当某件事值得被记住时，发布一个 Timeline 节点，它会成为公开记忆骨架的一部分。",
  expand: locale === "en" ? "Expand" : "展开",
  featuredOnly: locale === "en" ? "Featured only" : "只看精选",
  featuredSection:
    locale === "en" ? "Featured milestones" : "精选里程碑",
  featuredSectionDescription:
    locale === "en"
      ? "The most important memory anchors are pulled out before the full year-by-year archive."
      : "最重要的记忆锚点会先被提出来，再进入完整的年度归档。",
  filterByType: locale === "en" ? "Filter by type" : "按类型筛选",
  nodeFallback:
    locale === "en"
      ? "No extra description yet. This event currently acts as a lightweight memory anchor."
      : "这条节点还没有补充详细描述，目前主要作为轻量记忆锚点存在。",
  timelineArchive: locale === "en" ? "Year archive" : "年度归档",
  year: locale === "en" ? "Year" : "按年份",
  yearGroup: locale === "en" ? "Year group" : "年份分组",
});

function TimelineEventCard({
  event,
  locale,
}: {
  event: TimelineEvent;
  locale: SiteLocale;
}) {
  const copy = getSiteCopy(locale);
  const timelineCopy = getTimelineCopy(locale);
  const relatedLinks = [
    typeof event.relatedPost === "object" && event.relatedPost?.slug
      ? {
          href: `/blog/${event.relatedPost.slug}`,
          label: copy.common.relatedPost,
        }
      : null,
    typeof event.relatedUpdate === "object" && event.relatedUpdate?.id
      ? {
          href: "/updates",
          label: copy.common.relatedUpdates,
        }
      : null,
    typeof event.relatedChecklist === "object" && event.relatedChecklist?.id
      ? {
          href: "/checklists",
          label: locale === "en" ? "View Checklist" : "查看关联清单",
        }
      : null,
  ].filter((item): item is { href: string; label: string } => Boolean(item));

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
        <span className="sunny-dashboard-count">{getMonthLabel(event.eventDate, locale)}</span>
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

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const timelineCopy = getTimelineCopy(locale);
  const { featured, type, year } = await searchParams;
  const featuredOnly = featured === "1";
  const { docs: events } = await getPublicTimelineEvents();
  const eventTypes = [...new Set(events.map((event) => event.type))];
  const years = [...new Set(events.map((event) => new Date(event.eventDate).getFullYear().toString()))].sort(
    (left, right) => Number(right) - Number(left),
  );
  const featuredEvents = events.filter((event) => event.isFeatured).slice(0, 3);

  const filteredEvents = events.filter((event) => {
    const matchesFeatured = !featuredOnly || event.isFeatured;
    const matchesType = !type || event.type === type;
    const matchesYear = !year || new Date(event.eventDate).getFullYear().toString() === year;

    return matchesFeatured && matchesType && matchesYear;
  });

  const eventGroups = groupEventsByYear(filteredEvents);
  const hasFilters = Boolean(featuredOnly || type || year);

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-6 pb-4">
        <SectionIntro
          description={timelineCopy.description}
          eyebrow="Timeline"
          title="Timeline"
          stats={[
            { label: copy.timeline.statsEvents, value: events.length },
            { label: copy.timeline.statsFeatured, value: events.filter((event) => event.isFeatured).length },
            { label: copy.timeline.statsTypes, value: eventTypes.length },
          ]}
        />

        <SurfaceCard as="section" className="rounded-[1.1rem] md:rounded-[1.25rem]" variant="subtle">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildTimelineHref({})}
                className={`sunny-nav-link ${!featuredOnly && !type && !year ? "sunny-nav-link-active" : ""}`}
              >
                {timelineCopy.allEvents}
              </Link>
              <Link
                href={buildTimelineHref({ featured: true, type, year })}
                className={`sunny-nav-link ${featuredOnly ? "sunny-nav-link-active" : ""}`}
              >
                {timelineCopy.featuredOnly}
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p className="sunny-kicker text-[0.68rem] text-muted">{timelineCopy.filterByType}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.map((eventType) => (
                    <Link
                      key={eventType}
                      href={buildTimelineHref({ featured: featuredOnly, type: eventType === type ? undefined : eventType, year })}
                      className={`sunny-nav-link ${eventType === type ? "sunny-nav-link-active" : ""}`}
                    >
                      {eventType}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <p className="sunny-kicker text-[0.68rem] text-muted">{timelineCopy.year}</p>
                <div className="mt-3 flex flex-wrap gap-2 lg:justify-end">
                  {years.map((entryYear) => (
                    <Link
                      key={entryYear}
                      href={buildTimelineHref({ featured: featuredOnly, type, year: entryYear === year ? undefined : entryYear })}
                      className={`sunny-nav-link ${entryYear === year ? "sunny-nav-link-active" : ""}`}
                    >
                      {entryYear}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        {featuredEvents.length > 0 ? (
          <SurfaceCard as="section" variant="strong">
            <SectionHeader
              description={timelineCopy.featuredSectionDescription}
              kicker="Highlights"
              size="lg"
              title={timelineCopy.featuredSection}
            />
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {featuredEvents.map((event) => (
                <TimelineMiniCard
                  key={event.id}
                  date={formatShortDate(event.eventDate, locale)}
                  description={event.description ?? undefined}
                  href={buildTimelineHref({ featured: true })}
                  title={event.title}
                  type={event.type}
                />
              ))}
            </div>
          </SurfaceCard>
        ) : null}

        {filteredEvents.length === 0 ? (
          <EmptyState
            action={
              hasFilters ? (
                <Link className="sunny-dashboard-link" href="/timeline">
                  {timelineCopy.clear}
                </Link>
              ) : null
            }
            description={hasFilters ? timelineCopy.emptyFiltered : timelineCopy.emptyPublic}
            title={copy.timeline.emptyTitle}
          />
        ) : (
          <section className="space-y-8">
            <SectionHeader
              description={
                locale === "en"
                  ? "The full timeline keeps normal events scannable while letting featured memories breathe."
                  : "完整时间线让普通节点便于扫描，也让精选记忆拥有更清晰的位置。"
              }
              kicker="Archive"
              size="lg"
              title={timelineCopy.timelineArchive}
            />

            {eventGroups.map((group) => (
              <section key={group.year} className="grid gap-5 md:grid-cols-[8rem_minmax(0,1fr)]">
                <div className="md:sticky md:top-6 md:self-start">
                  <p className="sunny-kicker text-[0.68rem] text-muted">{timelineCopy.yearGroup}</p>
                  <h2 className="mt-2 text-4xl font-semibold text-foreground">{group.year}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {group.events.length} {locale === "en" ? "nodes" : "个节点"}
                  </p>
                </div>

                <div className="relative grid gap-4 border-l border-border pl-5 md:pl-7">
                  {group.events.map((event) => (
                    <div key={event.id} className="relative">
                      <span
                        aria-hidden
                        className={`absolute -left-[1.8rem] top-5 h-3 w-3 rounded-full border border-background ${
                          event.isFeatured ? "bg-accent" : "bg-muted"
                        } md:-left-[2.05rem]`}
                      />
                      <TimelineEventCard event={event} locale={locale} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
