import Link from "next/link";

const publicSurfaces = [
  { href: "/blog", label: "Blog", description: "Long-form writing and essays." },
  { href: "/notes", label: "Notes", description: "Short thoughts, fragments, and drafts." },
  { href: "/updates", label: "Updates", description: "Life and work progress in motion." },
  { href: "/timeline", label: "Timeline", description: "Milestones arranged for review." },
];

const privateSurfaces = [
  { href: "/admin", label: "Payload Admin", description: "Structured content editing and media management." },
  { href: "/dashboard", label: "Dashboard", description: "Private workspace for plans and shortcuts." },
];

export default function Home() {
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
              Start with `Users` and `Media`, then expand toward content collections.
            </li>
            <li>
              <strong className="block text-base text-foreground">Principle</strong>
              Build the content flow first, then refine the interface system.
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
                  <span className="text-sm text-accent-strong">Planned</span>
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
    </main>
  );
}
