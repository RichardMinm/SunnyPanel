import Link from "next/link";

import { TimelineArchive } from "@/components/public/timeline/TimelineArchive";
import { TimelineFilters } from "@/components/public/timeline/TimelineFilters";
import { SectionIntro } from "@/components/public/SectionIntro";
import { EmptyState, SectionHeader, SurfaceCard, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import {
  buildTimelineHref,
  filterTimelineEvents,
  getTimelineYears,
  groupTimelineEventsByYear,
} from "@/lib/timeline/public-timeline";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type { TimelineEvent } from "@/payload-types";

type TimelinePageContentProps = {
  events: TimelineEvent[];
  featuredOnly: boolean;
  locale: SiteLocale;
  selectedType?: string;
  selectedYear?: string;
};

export function TimelinePageContent({
  events,
  featuredOnly,
  locale,
  selectedType,
  selectedYear,
}: TimelinePageContentProps) {
  const copy = getSiteCopy(locale);
  const timelineCopy = copy.timeline;
  const eventTypes = [...new Set(events.map((event) => event.type))];
  const years = getTimelineYears(events);
  const featuredEvents = events.filter((event) => event.isFeatured).slice(0, 3);
  const filteredEvents = filterTimelineEvents(events, {
    featuredOnly,
    type: selectedType,
    year: selectedYear,
  });
  const eventGroups = groupTimelineEventsByYear(filteredEvents);
  const hasFilters = Boolean(featuredOnly || selectedType || selectedYear);

  return (
    <div className="sunny-timeline-narrative">
      <SectionIntro
        description={timelineCopy.description}
        eyebrow="Timeline"
        title="Timeline"
        stats={[
          { label: timelineCopy.statsEvents, value: events.length },
          { label: timelineCopy.statsFeatured, value: events.filter((event) => event.isFeatured).length },
          { label: timelineCopy.statsTypes, value: eventTypes.length },
        ]}
      />

      <TimelineFilters
        eventTypes={eventTypes}
        featuredOnly={featuredOnly}
        locale={locale}
        selectedType={selectedType}
        selectedYear={selectedYear}
        years={years}
      />

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
          title={timelineCopy.emptyTitle}
        />
      ) : (
        <TimelineArchive groups={eventGroups} locale={locale} />
      )}
    </div>
  );
}
