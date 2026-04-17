import Link from "next/link";

import { formatDate } from "@/lib/formatters";
import {
  getPublicNotes,
  getPublicPostsWithOptions,
  getPublicTimelineEvents,
  getPublicUpdates,
} from "@/lib/payload/public";

const publicSurfaces = [
  { href: "/blog", label: "Blog", description: "Long-form writing and essays.", status: "Live" },
  { href: "/notes", label: "Notes", description: "Short thoughts, fragments, and drafts.", status: "Live" },
  { href: "/updates", label: "Updates", description: "Life and work progress in motion.", status: "Live" },
  { href: "/timeline", label: "Timeline", description: "Milestones arranged for review.", status: "Live" },
];

const privateSurfaces = [
  { href: "/admin", label: "Payload Admin", description: "Structured content editing and media management." },
  { href: "/dashboard", label: "Dashboard", description: "Private workspace for plans and shortcuts." },
];

export default async function Home() {
  const [posts, notes, updates, timeline] = await Promise.all([
    getPublicPostsWithOptions({ limit: 3 }),
    getPublicNotes({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8 md:px-10 lg:px-12">
      <section className="sunny-fade-up grid gap-6 lg:grid-cols-[1.35fr_0.8fr]">
        <div className="sunny-card sunny-card-strong rounded-[2rem] p-8 md:p-10">
          <div className="mb-10 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className="sunny-kicker text-[0.72rem] text-accent-strong">SunnyPanel</span>
            <span className="rounded-full border border-border px-3 py-1">Phase 1 in progress</span>
            <span className="rounded-full border border-border px-3 py-1">Next.js + Payload + Postgres</span>
          </div>

          <div className="max-w-3xl space-y-6">
            <p className="sunny-kicker text-xs text-muted">Personal publishing and private operations</p>
            <h1 className="sunny-display text-5xl leading-none text-foreground md:text-7xl">
              A personal panel system built for expression, review, and long-term use.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted md:text-lg">
              SunnyPanel is being shaped as a single-user system with two faces: a public
              site for writing and timeline storytelling, and a private workspace for plans,
              content operations, and media management.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/admin"
            >
              Open Admin
            </Link>
            <Link
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/60"
              href="/dashboard"
            >
              Open Dashboard
            </Link>
          </div>
        </div>

        <aside className="sunny-card rounded-[2rem] p-8">
          <p className="sunny-kicker text-xs text-muted">Current build focus</p>
          <ul className="mt-6 space-y-5 text-sm leading-7 text-muted">
            <li>
              <strong className="block text-base text-foreground">Foundation</strong>
              Git workflow, Next.js bootstrap, Payload wiring, Docker local setup.
            </li>
            <li>
              <strong className="block text-base text-foreground">Collections</strong>
              `Users`, `Media`, `Post`, `Note`, `Update`, `TimelineEvent`, `Plan`, and `Page`
              are now in place.
            </li>
            <li>
              <strong className="block text-base text-foreground">Principle</strong>
              Public content flow is live. Next step is making the private workspace more task-ready.
            </li>
          </ul>
        </aside>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="sunny-kicker text-xs text-muted">Public surfaces</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Expression layer</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">Planned routes</span>
          </div>

          <div className="grid gap-4">
            {publicSurfaces.map((item) => (
              <div
                key={item.href}
                className="rounded-[1.5rem] border border-border bg-white/60 p-5 transition hover:-translate-y-1 hover:bg-white/80"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                    <p className="mt-1 text-sm text-muted">{item.description}</p>
                  </div>
                  <span className="text-sm text-accent-strong">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="sunny-kicker text-xs text-muted">Private surfaces</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Operation layer</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">Available now</span>
          </div>

          <div className="grid gap-4">
            {privateSurfaces.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                    <p className="mt-1 text-sm text-muted">{item.description}</p>
                  </div>
                  <span className="text-sm text-accent-strong">Open</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Latest long-form</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent blog posts</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {posts.totalDocs} published
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            {posts.docs.length > 0 ? (
              posts.docs.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold text-foreground">{post.title}</h3>
                    <span className="text-sm text-muted">{formatDate(post.publishedAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-muted">{post.summary}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                公开博客已经接入首页。发布第一篇 Post 之后，这里会显示最近内容摘要。
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="sunny-card rounded-[2rem] p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Timeline spine</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">Featured moments</h2>
              </div>
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
                {timeline.totalDocs} public
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {timeline.docs.length > 0 ? (
                timeline.docs.map((event) => (
                  <div key={event.id} className="rounded-[1.5rem] border border-border bg-white/60 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-foreground">{event.title}</h3>
                      <span className="text-xs uppercase tracking-[0.24em] text-muted">
                        {event.type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{formatDate(event.eventDate)}</p>
                    {event.description ? (
                      <p className="mt-3 text-sm leading-7 text-muted">{event.description}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                  把带 `isFeatured` 的 TimelineEvent 发布出来后，这里会成为首页的叙事入口。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Short-form stream</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Notes</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {notes.totalDocs} published
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {notes.docs.length > 0 ? (
              notes.docs.map((note) => (
                <div key={note.id} className="rounded-[1.5rem] border border-border bg-white/60 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{note.category}</span>
                    <span className="text-sm text-muted">{formatDate(note.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{note.content}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                Notes 已经准备好，适合先往里放碎片想法和小记录。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Rolling log</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Updates</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              {updates.totalDocs} published
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {updates.docs.length > 0 ? (
              updates.docs.map((update) => (
                <div key={update.id} className="rounded-[1.5rem] border border-border bg-white/60 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{update.type}</span>
                    <span className="text-sm text-muted">{formatDate(update.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{update.content}</p>
                  {update.link ? (
                    <a
                      className="mt-3 inline-flex text-sm font-semibold text-accent-strong"
                      href={update.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Visit linked resource
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                Updates 会比 Blog 更轻，适合记录进行中的生活、工作和项目变化。
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
