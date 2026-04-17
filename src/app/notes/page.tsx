import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicNotes } from "@/lib/payload/public";

export default async function NotesPage() {
  const { docs: notes } = await getPublicNotes();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8 md:px-10">
      <SectionIntro
        eyebrow="Notes"
        title="Short fragments"
        description="A lighter stream for quick entries, in-progress ideas, and moments worth keeping without turning everything into a full article."
      />

      {notes.length === 0 ? (
        <CollectionEmptyState
          title="还没有公开短文"
          body="等你从后台发布第一条公开 Note，这里就会开始积累属于 SunnyPanel 的短内容流。"
        />
      ) : (
        <section className="grid gap-4">
          {notes.map((note) => (
            <article key={note.id} className="sunny-card rounded-[1.8rem] p-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{formatDate(note.createdAt)}</span>
                {note.category ? <span>{note.category}</span> : null}
                {note.mood ? <span>{note.mood}</span> : null}
                {note.pinned ? (
                  <span className="rounded-full bg-white/70 px-2 py-1 text-accent-strong">Pinned</span>
                ) : null}
              </div>
              <p className="mt-4 leading-8 text-foreground">{note.content}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
