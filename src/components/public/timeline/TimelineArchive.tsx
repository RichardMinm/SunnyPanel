import { TimelineEventCard } from "@/components/public/timeline/TimelineEventCard";
import { SectionHeader } from "@/components/ui/SunnyComponents";
import type { TimelineEventGroup } from "@/lib/timeline/public-timeline";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type TimelineArchiveProps = {
  groups: TimelineEventGroup[];
  locale: SiteLocale;
};

export function TimelineArchive({ groups, locale }: TimelineArchiveProps) {
  const timelineCopy = getSiteCopy(locale).timeline;

  return (
    <section className="space-y-8">
      <SectionHeader
        description={timelineCopy.archiveDescription}
        kicker="Archive"
        size="lg"
        title={timelineCopy.timelineArchive}
      />

      {groups.map((group) => (
        <section key={group.year} className="grid gap-5 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="md:sticky md:top-6 md:self-start">
            <p className="sunny-kicker text-muted">{timelineCopy.yearGroup}</p>
            <h2 className="mt-2 text-4xl font-semibold text-foreground">{group.year}</h2>
            <p className="mt-2 text-sm text-muted">
              {group.events.length} {timelineCopy.nodeCount}
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
  );
}
