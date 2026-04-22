import Link from "next/link";
import type { ReactNode } from "react";

import { PublicSiteFooter, PublicSiteHeader } from "@/components/public/PublicSiteChrome";
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

      <div
        className={`mt-5 flex-1 ${showTimelineRail ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start" : ""} md:mt-6`}
      >
        <div className="min-w-0">{children}</div>

        {showTimelineRail ? (
          <aside className="hidden xl:block">
            <div className="sunny-panel sticky top-6 rounded-[1.6rem] px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sunny-kicker text-[0.68rem] text-muted">Timeline</p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{copy.nav.timeline}</h2>
                </div>
                <Link href="/timeline" className="text-sm font-semibold text-accent-strong">
                  {locale === "en" ? "All" : "全部"}
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {recentTimeline.length > 0 ? (
                  recentTimeline.map((event) => (
                    <Link
                      key={event.id}
                      href="/timeline"
                      className="block rounded-[1.15rem] border border-border bg-white/62 px-4 py-4 transition hover:-translate-y-1 hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="sunny-badge sunny-badge-accent">{event.type}</span>
                        <span className="text-xs text-muted">{formatShortDate(event.eventDate)}</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-7 text-foreground">{event.title}</p>
                      {event.description ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{event.description}</p>
                      ) : null}
                    </Link>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-dashed border-border bg-white/45 px-4 py-4 text-sm leading-7 text-muted">
                    {copy.timeline.emptyBody}
                  </div>
                )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <PublicSiteFooter locale={locale} />
    </div>
  );
}
