import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate, formatShortDate } from "@/lib/formatters";
import { getPublicTimelineEvents } from "@/lib/payload/public";

export default async function TimelinePage() {
  const { docs: events } = await getPublicTimelineEvents();
  const featuredCount = events.filter((event) => event.isFeatured).length;

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Timeline"
          title="Timeline"
          stats={[
            { label: "公开节点", value: events.length },
            { label: "精选事件", value: featuredCount },
            { label: "事件类型", value: new Set(events.map((event) => event.type)).size },
          ]}
        />

        {events.length === 0 ? (
          <CollectionEmptyState
            title="时间线还是空的"
            body="等你在后台添加第一条 `TimelineEvent` 并公开发布后，这里就会开始形成年度回顾结构。"
          />
        ) : (
          <section className="sunny-card rounded-[2.2rem] px-6 py-8 md:px-8">
            <div className="relative">
              <div className="absolute left-[2.35rem] top-4 bottom-4 hidden w-px bg-[linear-gradient(180deg,rgba(24,34,44,0.15),rgba(24,34,44,0.04))] md:block" />

              <div className="space-y-6">
                {events.map((event) => (
                  <article key={event.id} className="relative grid gap-4 md:grid-cols-[7rem_1fr] md:gap-6">
                    <div className="relative hidden md:block">
                      <div className="absolute left-[1.55rem] top-3 h-4 w-4 rounded-full border-4 border-background bg-accent" />
                      <div className="rounded-[1.2rem] border border-border bg-white/58 px-4 py-3 text-sm text-muted">
                        {formatShortDate(event.eventDate)}
                      </div>
                    </div>

                    <div className="rounded-[1.45rem] border border-border bg-white/62 p-5 md:p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="sunny-badge sunny-badge-accent">{event.type}</span>
                        <span className="text-sm text-muted md:hidden">{formatDate(event.eventDate)}</span>
                        {event.isFeatured ? (
                          <span className="sunny-badge sunny-badge-muted">Featured</span>
                        ) : null}
                      </div>

                      <h2 className="mt-4 text-2xl font-semibold text-foreground">{event.title}</h2>
                      {event.description ? (
                        <p className="mt-3 text-sm leading-8 text-muted">{event.description}</p>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-accent-strong">
                        {typeof event.relatedPost === "object" && event.relatedPost?.slug ? (
                          <Link href={`/blog/${event.relatedPost.slug}`}>查看关联文章</Link>
                        ) : null}
                        {typeof event.relatedUpdate === "object" && event.relatedUpdate?.id ? (
                          <Link href="/updates">查看关联动态</Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
