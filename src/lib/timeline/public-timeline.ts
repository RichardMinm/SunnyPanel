import type { TimelineEvent } from "@/payload-types";

import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";

const formatterLocales: Record<SiteLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
};

export type TimelineEventGroup = {
  events: TimelineEvent[];
  year: string;
};

export type TimelineFilters = {
  featured?: boolean;
  type?: string;
  year?: string;
};

export function buildTimelineHref(filters: TimelineFilters) {
  const params = new URLSearchParams();

  if (filters.featured) {
    params.set("featured", "1");
  }

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.year) {
    params.set("year", filters.year);
  }

  const query = params.toString();

  return query ? `/timeline?${query}` : "/timeline";
}

export function getTimelineMonthLabel(value: string, locale: SiteLocale) {
  const copy = getSiteCopy(locale);
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return copy.timeline.unknownMonth;
  }

  return new Intl.DateTimeFormat(formatterLocales[locale], {
    month: "long",
  }).format(date);
}

export function groupTimelineEventsByYear(events: TimelineEvent[]): TimelineEventGroup[] {
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
}

export function getTimelineYears(events: TimelineEvent[]) {
  return [...new Set(events.map((event) => new Date(event.eventDate).getFullYear().toString()))].sort(
    (left, right) => Number(right) - Number(left),
  );
}

export function filterTimelineEvents(
  events: TimelineEvent[],
  filters: { featuredOnly: boolean; type?: string; year?: string },
) {
  return events.filter((event) => {
    const matchesFeatured = !filters.featuredOnly || event.isFeatured;
    const matchesType = !filters.type || event.type === filters.type;
    const matchesYear = !filters.year || new Date(event.eventDate).getFullYear().toString() === filters.year;

    return matchesFeatured && matchesType && matchesYear;
  });
}
