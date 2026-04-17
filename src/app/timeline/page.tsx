import Link from "next/link";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicTimelineEvents } from "@/lib/payload/public";

export default async function TimelinePage() {
  const { docs: events } = await getPublicTimelineEvents();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <SectionIntro
        eyebrow="Timeline"
        title="Milestones and recall"
        description="Timeline is the narrative spine of SunnyPanel. It is where blog posts, updates, and standalone milestones connect into a reviewable sequence."
      />

      {events.length === 0 ? (
        <CollectionEmptyState
          title="时间线还是空的"
          body="等你在后台添加第一条 `TimelineEvent` 并公开发布后，这里就会开始形成年度回顾结构。"
        />
      ) : (
        <section className="grid gap-4">
          {events.map((event) => (
            <article key={event.id} className="sunny-card rounded-[1.8rem] p-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{formatDate(event.eventDate)}</span>
                <span className="rounded-full border border-border px-2 py-1">{event.type}</span>
                {event.isFeatured ? (
                  <span className="rounded-full bg-white/70 px-2 py-1 text-accent-strong">Featured</span>
                ) : null}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-foreground">{event.title}</h2>
              {event.description ? <p className="mt-3 leading-8 text-muted">{event.description}</p> : null}

              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-accent-strong">
                {typeof event.relatedPost === "object" && event.relatedPost?.slug ? (
                  <Link href={`/blog/${event.relatedPost.slug}`}>Related post</Link>
                ) : null}
                {typeof event.relatedUpdate === "object" && event.relatedUpdate?.id ? (
                  <Link href="/updates">Related update</Link>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
