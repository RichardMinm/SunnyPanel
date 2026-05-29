import Link from "next/link";

import { SurfaceCard } from "@/components/ui/SunnyComponents";
import { buildTimelineHref } from "@/lib/timeline/public-timeline";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type TimelineFiltersProps = {
  eventTypes: string[];
  featuredOnly: boolean;
  locale: SiteLocale;
  selectedType?: string;
  selectedYear?: string;
  years: string[];
};

export function TimelineFilters({
  eventTypes,
  featuredOnly,
  locale,
  selectedType,
  selectedYear,
  years,
}: TimelineFiltersProps) {
  const timelineCopy = getSiteCopy(locale).timeline;

  return (
    <SurfaceCard as="section" className="rounded-lg md:rounded-lg" variant="subtle">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildTimelineHref({})}
            className={`sunny-nav-link ${!featuredOnly && !selectedType && !selectedYear ? "sunny-nav-link-active" : ""}`}
          >
            {timelineCopy.allEvents}
          </Link>
          <Link
            href={buildTimelineHref({ featured: true, type: selectedType, year: selectedYear })}
            className={`sunny-nav-link ${featuredOnly ? "sunny-nav-link-active" : ""}`}
          >
            {timelineCopy.featuredOnly}
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="sunny-kicker text-muted">{timelineCopy.filterByType}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {eventTypes.map((eventType) => (
                <Link
                  key={eventType}
                  href={buildTimelineHref({
                    featured: featuredOnly,
                    type: eventType === selectedType ? undefined : eventType,
                    year: selectedYear,
                  })}
                  className={`sunny-nav-link ${eventType === selectedType ? "sunny-nav-link-active" : ""}`}
                >
                  {eventType}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="sunny-kicker text-muted">{timelineCopy.year}</p>
            <div className="mt-3 flex flex-wrap gap-2 lg:justify-end">
              {years.map((entryYear) => (
                <Link
                  key={entryYear}
                  href={buildTimelineHref({
                    featured: featuredOnly,
                    type: selectedType,
                    year: entryYear === selectedYear ? undefined : entryYear,
                  })}
                  className={`sunny-nav-link ${entryYear === selectedYear ? "sunny-nav-link-active" : ""}`}
                >
                  {entryYear}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
