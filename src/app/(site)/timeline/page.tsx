import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate, formatShortDate } from "@/lib/formatters";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicTimelineEvents } from "@/lib/payload/public";

type TimelineSearchParams = Promise<{
  featured?: string;
  type?: string;
  year?: string;
}>;

type TimelinePageProps = {
  searchParams: TimelineSearchParams;
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

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const { featured, type, year } = await searchParams;
  const featuredOnly = featured === "1";
  const { docs: events } = await getPublicTimelineEvents();
  const eventTypes = [...new Set(events.map((event) => event.type))];
  const years = [...new Set(events.map((event) => new Date(event.eventDate).getFullYear().toString()))].sort(
    (left, right) => Number(right) - Number(left),
  );

  const filteredEvents = events.filter((event) => {
    const matchesFeatured = !featuredOnly || event.isFeatured;
    const matchesType = !type || event.type === type;
    const matchesYear = !year || new Date(event.eventDate).getFullYear().toString() === year;

    return matchesFeatured && matchesType && matchesYear;
  });

  const groups = filteredEvents.reduce<Record<string, typeof filteredEvents>>((accumulator, event) => {
    const groupYear = new Date(event.eventDate).getFullYear().toString();
    const existing = accumulator[groupYear] ?? [];

    accumulator[groupYear] = [...existing, event];
    return accumulator;
  }, {});

  const orderedYears = Object.keys(groups).sort((left, right) => Number(right) - Number(left));

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Timeline"
          title="Timeline"
          stats={[
            { label: copy.timeline.statsEvents, value: events.length },
            { label: copy.timeline.statsFeatured, value: events.filter((event) => event.isFeatured).length },
            { label: copy.timeline.statsTypes, value: eventTypes.length },
          ]}
        />

        <section className="sunny-panel rounded-[1.6rem] px-5 py-5 md:px-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildTimelineHref({})}
                className={`sunny-nav-link ${!featuredOnly && !type && !year ? "sunny-nav-link-active" : ""}`}
              >
                {locale === "en" ? "All events" : "全部节点"}
              </Link>
              <Link
                href={buildTimelineHref({ featured: true, type, year })}
                className={`sunny-nav-link ${featuredOnly ? "sunny-nav-link-active" : ""}`}
              >
                {locale === "en" ? "Featured only" : "只看精选"}
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {locale === "en" ? "Filter by type" : "按类型筛选"}
                </p>
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {locale === "en" ? "Year" : "按年份"}
                </p>
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
        </section>

        {filteredEvents.length === 0 ? (
          <CollectionEmptyState
            title={copy.timeline.emptyTitle}
            body={copy.timeline.emptyBody}
          />
        ) : (
          <section className="space-y-6">
            {orderedYears.map((entryYear) => (
              <section key={entryYear} className="sunny-card rounded-[2rem] px-6 py-6 md:px-8 md:py-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="sunny-kicker text-[0.68rem] text-muted">{locale === "en" ? "Year group" : "年份分组"}</p>
                    <h2 className="sunny-display mt-2 text-3xl text-foreground md:text-4xl">{entryYear}</h2>
                  </div>
                  <span className="rounded-full bg-white/75 px-3 py-1 text-sm text-muted">
                    {groups[entryYear].length}
                  </span>
                </div>

                <div className="mt-6 space-y-4">
                  {groups[entryYear].map((event) => (
                    <details
                      key={event.id}
                      className="group rounded-[1.4rem] border border-border bg-white/62 px-5 py-4"
                      open={Boolean(event.isFeatured)}
                    >
                      <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="sunny-badge sunny-badge-accent">{event.type}</span>
                            <span className="text-sm text-muted">{formatDate(event.eventDate)}</span>
                            {event.isFeatured ? (
                              <span className="sunny-badge sunny-badge-muted">{copy.common.featured}</span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-xl font-semibold text-foreground">{event.title}</h3>
                        </div>
                        <span className="text-sm font-semibold text-accent-strong group-open:hidden">
                          {locale === "en" ? "Expand" : "展开"}
                        </span>
                        <span className="hidden text-sm font-semibold text-accent-strong group-open:block">
                          {locale === "en" ? "Collapse" : "收起"}
                        </span>
                      </summary>

                      <div className="mt-4 border-t border-border/70 pt-4">
                        {event.description ? (
                          <p className="text-sm leading-8 text-muted">{event.description}</p>
                        ) : (
                          <p className="text-sm leading-8 text-muted">
                            {locale === "en"
                              ? "No extra description yet. This event currently acts as a lightweight node."
                              : "这条节点还没有补充详细描述，目前主要作为轻量时间锚点存在。"}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-accent-strong">
                          <span>{formatShortDate(event.eventDate)}</span>
                          {typeof event.relatedPost === "object" && event.relatedPost?.slug ? (
                            <Link href={`/blog/${event.relatedPost.slug}`}>{copy.common.relatedPost}</Link>
                          ) : null}
                          {typeof event.relatedUpdate === "object" && event.relatedUpdate?.id ? (
                            <Link href="/updates">{copy.common.relatedUpdates}</Link>
                          ) : null}
                        </div>
                      </div>
                    </details>
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
