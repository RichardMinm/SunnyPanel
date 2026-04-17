import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicUpdates } from "@/lib/payload/public";

export default async function UpdatesPage() {
  const { docs: updates } = await getPublicUpdates();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <SectionIntro
        eyebrow="Updates"
        title="Progress in motion"
        description="A running stream for life, work, and project changes that do not need a full article but still deserve a place in the system."
      />

      {updates.length === 0 ? (
        <CollectionEmptyState
          title="还没有公开动态"
          body="后台 `Update` collection 已经可用。发布内容后，这里会自动形成一条时间顺序的动态流。"
        />
      ) : (
        <section className="grid gap-4">
          {updates.map((update) => (
            <article key={update.id} className="sunny-card rounded-[1.8rem] p-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="rounded-full border border-border px-2 py-1">{update.type}</span>
                <span>{formatDate(update.createdAt)}</span>
              </div>
              <p className="mt-4 leading-8 text-foreground">{update.content}</p>
              {update.link ? (
                <a
                  className="mt-4 inline-flex text-sm font-semibold text-accent-strong"
                  href={update.link}
                  rel="noreferrer"
                  target="_blank"
                >
                  Visit link
                </a>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
