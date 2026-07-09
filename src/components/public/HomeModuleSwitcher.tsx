"use client";

import Link from "next/link";

import type { TimelineEvent } from "@/payload-types";

import { EmptyState, SectionHeader, SurfaceCard, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type HomeModuleSwitcherProps = {
  featuredTimeline: TimelineEvent[];
  locale: SiteLocale;
};

export function HomeModuleSwitcher({
  featuredTimeline,
  locale,
}: HomeModuleSwitcherProps) {
  const copy = getSiteCopy(locale);

  return (
    <SurfaceCard as="section" variant="default">
      <SectionHeader
        action={
          <Link href="/timeline" className="sunny-button-secondary">
            {locale === "en" ? "Open Timeline" : "打开时间线"}
          </Link>
        }
        description={copy.home.timelineDescription}
        kicker={locale === "en" ? "Timeline" : "时间线"}
        size="lg"
        title={copy.home.timelineTitle}
      />

      <div className="mt-6">
        {featuredTimeline.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-3 md:gap-4">
            {featuredTimeline.map((event) => (
              <TimelineMiniCard
                key={event.id}
                date={formatShortDate(event.eventDate, locale)}
                description={
                  event.description ||
                  (locale === "en"
                    ? "This event currently acts as a lightweight milestone in the public narrative."
                    : "这条节点目前作为公开叙事中的一个轻量里程碑存在。")
                }
                href="/timeline"
                title={event.title}
                type={event.type}
              />
            ))}
          </div>
        ) : (
          <EmptyState description={copy.home.timelineEmpty} />
        )}
      </div>
    </SurfaceCard>
  );
}
