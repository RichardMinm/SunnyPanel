import Link from "next/link";

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

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <section className="sunny-card sunny-card-strong rounded-[2rem] p-8 md:p-10">
        <p className="sunny-kicker text-xs text-muted">Private workspace</p>
        <h1 className="sunny-display mt-4 text-4xl text-foreground md:text-5xl">Dashboard</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
          This route now acts as the custom workspace landing page. It does not replace Payload
          Admin yet, but it gives you one place to jump into writing, planning, timeline curation,
          and media operations while we keep building the private UI.
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
    </main>
  );
}
