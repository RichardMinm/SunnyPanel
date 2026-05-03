import Link from "next/link";
import type { ReactNode } from "react";

import { MotionReveal } from "@/components/public/MotionReveal";
import { PublicSiteFooter, PublicSiteHeader } from "@/components/public/PublicSiteChrome";
import { PublicRouteTransition } from "@/components/public/PublicRouteTransition";
import { EmptyState, SectionHeader, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import { getPublicTimelineEvents } from "@/lib/payload/public";

type PublicSiteFrameProps = {
  children: ReactNode;
  locale: SiteLocale;
  showTimelineRail?: boolean;
};

export async function PublicSiteFrame({
  children,
  locale,
  showTimelineRail = true,
}: PublicSiteFrameProps) {
  const copy = getSiteCopy(locale);
  const recentTimeline = showTimelineRail
    ? (await getPublicTimelineEvents({ limit: 5 })).docs
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[74rem] flex-1 flex-col px-3 py-3 sm:px-4 md:px-6 lg:px-8">
      <PublicSiteHeader locale={locale} />

      <PublicRouteTransition
        aside={
          <aside className="hidden xl:block">
            <div className="sunny-panel sticky top-6 rounded-[1.6rem] px-5 py-5">
              <SectionHeader
                action={
                  <Link href="/timeline" className="text-sm font-semibold text-accent-strong">
                    {locale === "en" ? "All" : "全部"}
                  </Link>
                }
                kicker="Timeline"
                size="sm"
                title={copy.nav.timeline}
              />

              <div className="mt-5 space-y-3">
                {recentTimeline.length > 0 ? (
                  recentTimeline.map((event, index) => (
                    <MotionReveal key={event.id} delay={index * 0.05}>
                      <TimelineMiniCard
                        date={formatShortDate(event.eventDate, locale)}
                        description={event.description ?? undefined}
                        href="/timeline"
                        title={event.title}
                        type={event.type}
                        variant="rail"
                      />
                    </MotionReveal>
                  ))
                ) : (
                  <EmptyState description={copy.timeline.emptyBody} />
                )}
              </div>
            </div>
          </aside>
        }
        showTimelineRail={showTimelineRail}
      >
        {children}
      </PublicRouteTransition>

      <PublicSiteFooter locale={locale} />
    </div>
  );
}
