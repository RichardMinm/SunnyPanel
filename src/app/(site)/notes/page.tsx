import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicNotes } from "@/lib/payload/public";

export default async function NotesPage() {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const { docs: notes } = await getPublicNotes();
  const moodCount = new Set(notes.map((note) => note.mood).filter(Boolean)).size;

  return (
    <PublicSiteFrame locale={locale}>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Notes"
          title="Notes"
          stats={[
            { label: copy.notes.statsNotes, value: notes.length },
            { label: copy.notes.statsPinned, value: notes.filter((note) => note.pinned).length },
            { label: copy.notes.statsMoods, value: moodCount },
          ]}
        />

        {notes.length === 0 ? (
          <CollectionEmptyState
            title={copy.notes.emptyTitle}
            body={copy.notes.emptyBody}
          />
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {notes.map((note, index) => (
              <article
                key={note.id}
                className={`sunny-card rounded-[1.6rem] p-5 ${index % 3 === 0 ? "md:translate-y-2" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="sunny-badge sunny-badge-muted">{note.category}</span>
                  {note.mood ? <span className="sunny-badge sunny-badge-accent">{note.mood}</span> : null}
                  <span>{formatDate(note.createdAt)}</span>
                  {note.pinned ? (
                    <span className="rounded-full bg-white/70 px-2 py-1 text-accent-strong">{copy.common.pinned}</span>
                  ) : null}
                </div>
                <p className="mt-5 text-[1.02rem] leading-8 text-foreground">{note.content}</p>
              </article>
            ))}
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
