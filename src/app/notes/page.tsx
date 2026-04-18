import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicNotes } from "@/lib/payload/public";

export default async function NotesPage() {
  const { docs: notes } = await getPublicNotes();
  const moodCount = new Set(notes.map((note) => note.mood).filter(Boolean)).size;

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <SectionIntro
          eyebrow="Notes"
          title="短想法、碎片与未必要变成长文的东西"
          description="Notes 更轻，也更贴近日常。它适合记录一个瞬间、一句判断、一个没完全展开但值得保留的念头。"
          stats={[
            { label: "公开短文", value: notes.length },
            { label: "置顶条目", value: notes.filter((note) => note.pinned).length },
            { label: "情绪标签", value: moodCount },
          ]}
        />

        {notes.length === 0 ? (
          <CollectionEmptyState
            title="还没有公开短文"
            body="等你从后台发布第一条公开 Note，这里就会开始积累属于 SunnyPanel 的短内容流。"
          />
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {notes.map((note, index) => (
              <article
                key={note.id}
                className={`sunny-card rounded-[1.9rem] p-6 ${index % 3 === 0 ? "md:translate-y-4" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="sunny-badge sunny-badge-muted">{note.category}</span>
                  {note.mood ? <span className="sunny-badge sunny-badge-accent">{note.mood}</span> : null}
                  <span>{formatDate(note.createdAt)}</span>
                  {note.pinned ? (
                    <span className="rounded-full bg-white/70 px-2 py-1 text-accent-strong">Pinned</span>
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
