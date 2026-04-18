import Link from "next/link";

import { formatDate, formatDateTime, formatShortDate } from "@/lib/formatters";
import { getWorkspaceSnapshot } from "@/lib/payload/workspace";

const workspaceShortcuts = [
  {
    href: "/admin/collections/posts",
    label: "Write a Post",
    description: "Long-form publishing, summary writing, and cover image setup.",
  },
  {
    href: "/admin/collections/notes",
    label: "Capture a Note",
    description: "Quick fragments, short reflections, and lightweight entries.",
  },
  {
    href: "/admin/collections/updates",
    label: "Log an Update",
    description: "Short progress logs for work, life, and project movement.",
  },
  {
    href: "/admin/collections/timeline-events",
    label: "Add Timeline Event",
    description: "Attach milestones to the public narrative spine.",
  },
  {
    href: "/admin/collections/plans",
    label: "Manage Plans",
    description: "Private goals, active priorities, and lightweight planning.",
  },
  {
    href: "/admin/collections/media",
    label: "Upload Media",
    description: "Centralized images and file assets for the whole system.",
  },
];

const workspaceTracks = [
  {
    title: "Content operations",
    body: "Use Payload Admin as the source of truth for creation, publishing, and media management while the custom private UI is still being assembled.",
  },
  {
    title: "Planning layer",
    body: "The `Plan` collection is now part of V1, so the dashboard can evolve into a true single-user workspace instead of staying a generic CMS shell.",
  },
  {
    title: "Review rhythm",
    body: "Timeline and updates are already readable on the public side, which means every new record you add immediately reinforces the site's long-term memory.",
  },
];

const statusTone: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-700",
  medium: "bg-sky-100 text-sky-700",
  low: "bg-stone-200 text-stone-700",
  private: "bg-stone-200 text-stone-700",
  public: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-100 text-emerald-700",
};

const getTone = (value: string) => statusTone[value] ?? "bg-stone-200 text-stone-700";

export default async function DashboardPage() {
  const snapshot = await getWorkspaceSnapshot();
  const displayName = snapshot.user.displayName || snapshot.user.email;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <section className="sunny-card sunny-card-strong rounded-[2rem] p-8 md:p-10">
        <p className="sunny-kicker text-xs text-muted">Private workspace</p>
        <h1 className="sunny-display mt-4 text-4xl text-foreground md:text-5xl">Dashboard</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
          你好，{displayName}。这个页面现在已经是登录感知的私有工作台，会把计划、草稿、
          最近内容和公开面状态收拢到一个地方，方便你从这里继续运营 SunnyPanel。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/admin"
          >
            Open Payload Admin
          </Link>
          <Link
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-white/60"
            href="/timeline"
          >
            Review Public Timeline
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sunny-card rounded-[1.75rem] p-6">
          <p className="sunny-kicker text-xs text-muted">Plans</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">{snapshot.counts.plans}</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            {snapshot.counts.highPriorityPlans} 个高优先级私有计划正在等待推进。
          </p>
        </div>

        <div className="sunny-card rounded-[1.75rem] p-6">
          <p className="sunny-kicker text-xs text-muted">Draft backlog</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">
            {snapshot.counts.draftSurfaces}
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            其中 Post 草稿 {snapshot.counts.draftPosts} 篇，其余来自短文、动态和时间线。
          </p>
        </div>

        <div className="sunny-card rounded-[1.75rem] p-6">
          <p className="sunny-kicker text-xs text-muted">Public surface</p>
          <p className="mt-4 text-4xl font-semibold text-foreground">
            {snapshot.counts.publicSurfaces}
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            当前已有公开内容在 Blog、Notes、Updates 和 Timeline 上可被访问。
          </p>
        </div>

        <div className="sunny-card rounded-[1.75rem] p-6">
          <p className="sunny-kicker text-xs text-muted">Account</p>
          <p className="mt-4 text-lg font-semibold text-foreground">{snapshot.user.email}</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            账户创建于 {formatShortDate(snapshot.user.createdAt)}，最近可继续从这里切到 Admin。
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Quick operations</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Start from here</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
              Admin shortcuts
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {workspaceShortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[1.5rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
              >
                <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <p className="sunny-kicker text-xs text-muted">Build notes</p>
          <h2 className="sunny-display mt-2 text-3xl text-foreground">What this dashboard is doing</h2>

          <div className="mt-6 space-y-5 text-sm leading-7 text-muted">
            {workspaceTracks.map((item) => (
              <div key={item.title} className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Plans</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Upcoming priorities</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/plans">
              Open all plans
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.plans.length > 0 ? (
              snapshot.plans.map((plan) => (
                <div key={plan.id} className="rounded-[1.5rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{plan.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.priority)}`}>
                        {plan.priority}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(plan.status)}`}>
                        {plan.status}
                      </span>
                    </div>
                  </div>
                  {plan.description ? (
                    <p className="mt-3 text-sm leading-7 text-muted">{plan.description}</p>
                  ) : null}
                  <p className="mt-3 text-sm text-muted">
                    截止日期：{formatDate(plan.dueDate)} | 创建于 {formatShortDate(plan.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                `Plan` collection 已经是 V1 的一部分了。创建第一条计划后，这里会变成你的私有行动列表。
              </div>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Editorial queue</p>
              <h2 className="sunny-display mt-2 text-3xl text-foreground">Recent long-form work</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/posts">
              Manage posts
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentPosts.length > 0 ? (
              snapshot.recentPosts.map((post) => (
                <div key={post.id} className="rounded-[1.5rem] border border-border bg-white/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-foreground">{post.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(post.status)}`}>
                        {post.status}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(post.visibility)}`}>
                        {post.visibility}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">{post.summary}</p>
                  <p className="mt-3 text-sm text-muted">
                    最近更新：{formatDateTime(post.updatedAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                Post collection 已连通。等你创建内容后，这里会显示最近编辑的长文。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Notes</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent fragments</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/notes">
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentNotes.length > 0 ? (
              snapshot.recentNotes.map((note) => (
                <div key={note.id} className="rounded-[1.25rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{note.category}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(note.status)}`}>
                      {note.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{note.content}</p>
                  <p className="mt-3 text-sm text-muted">更新于 {formatDateTime(note.updatedAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">最近还没有短文片段。</p>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Updates</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent movement</h2>
            </div>
            <Link className="text-sm font-semibold text-accent-strong" href="/admin/collections/updates">
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentUpdates.length > 0 ? (
              snapshot.recentUpdates.map((update) => (
                <div key={update.id} className="rounded-[1.25rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.24em] text-muted">{update.type}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(update.status)}`}>
                      {update.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{update.content}</p>
                  <p className="mt-3 text-sm text-muted">更新于 {formatDateTime(update.updatedAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">最近还没有动态记录。</p>
            )}
          </div>
        </div>

        <div className="sunny-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sunny-kicker text-xs text-muted">Timeline</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Recent milestones</h2>
            </div>
            <Link
              className="text-sm font-semibold text-accent-strong"
              href="/admin/collections/timeline-events"
            >
              Open
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.recentTimelineEvents.length > 0 ? (
              snapshot.recentTimelineEvents.map((event) => (
                <div key={event.id} className="rounded-[1.25rem] border border-border bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{event.title}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTone(event.status)}`}>
                      {event.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {formatShortDate(event.eventDate)} | 类型：{event.type}
                  </p>
                  {event.description ? (
                    <p className="mt-3 text-sm leading-7 text-muted">{event.description}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">时间线还没有内部记录。</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
