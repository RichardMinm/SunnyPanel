import { MarkdownField } from "@/components/public/ContentRenderer";
import { PublicCollectionEmptySwitch } from "@/components/public/PublicCollectionEmptySwitch";
import { PublicListPage } from "@/components/public/PublicListPage";
import { RecordCoverImage } from "@/components/public/RecordCoverImage";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicNotes } from "@/lib/payload/public";
import { getContentMarkdownFallback } from "@/lib/rich-content/compat";

export const revalidate = 60;

export default async function NotesPage() {
  const { docs: notes } = await getPublicNotes();

  return (
    <PublicListPage>
      {({ locale }) => {
        const copy = getSiteCopy(locale);
        const moodCount = new Set(notes.map((note) => note.mood).filter(Boolean)).size;

        return (
          <>
            <SectionIntro
              eyebrow="Notes"
              stats={[
                { label: copy.notes.statsNotes, value: notes.length },
                { label: copy.notes.statsPinned, value: notes.filter((note) => note.pinned).length },
                { label: copy.notes.statsMoods, value: moodCount },
              ]}
              title="Notes"
            />

            <PublicCollectionEmptySwitch
              body={copy.notes.emptyBody}
              isEmpty={notes.length === 0}
              title={copy.notes.emptyTitle}
            >
              <section className="grid gap-4 md:grid-cols-2">
                {notes.map((note, index) => (
                  <article
                    key={note.id}
                    className={`sunny-card overflow-hidden rounded-[1.6rem] ${index % 3 === 0 ? "md:translate-y-2" : ""}`}
                  >
                    <RecordCoverImage
                      containerClassName="border-b border-border/80"
                      imageClassName="h-52 w-full object-cover"
                      preferredSize="thumbnail"
                      record={note as unknown as Record<string, unknown>}
                    />
                    <div className="p-5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="sunny-badge sunny-badge-muted">{note.category}</span>
                        {note.mood ? <span className="sunny-badge sunny-badge-accent">{note.mood}</span> : null}
                        <span>{formatDate(note.createdAt, locale)}</span>
                        {note.pinned ? (
                          <span className="sunny-badge sunny-badge-accent">
                            {copy.common.pinned}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-5">
                        <MarkdownField content={note.contentRich} fallbackMarkdown={getContentMarkdownFallback(note)} />
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            </PublicCollectionEmptySwitch>
          </>
        );
      }}
    </PublicListPage>
  );
}
