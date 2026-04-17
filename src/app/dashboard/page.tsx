export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 px-6 py-12 md:px-10">
      <section className="sunny-card sunny-card-strong w-full rounded-[2rem] p-8 md:p-10">
        <p className="sunny-kicker text-xs text-muted">Private workspace</p>
        <h1 className="sunny-display mt-4 text-4xl text-foreground md:text-5xl">Dashboard</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
          This route is reserved for the custom private workspace. In V1 it will host plan
          management, content shortcuts, and recent activity snapshots alongside Payload Admin.
        </p>
      </section>
    </main>
  );
}
