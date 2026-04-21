import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDate } from "@/lib/formatters";
import { getPublicUpdates } from "@/lib/payload/public";

export default async function UpdatesPage() {
  const { docs: updates } = await getPublicUpdates();
  const linkedCount = updates.filter((update) => Boolean(update.link)).length;

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-6 pb-4 md:gap-8">
        <SectionIntro
          eyebrow="Updates"
          title="Updates"
          stats={[
            { label: "公开动态", value: updates.length },
            { label: "带链接记录", value: linkedCount },
            { label: "类型覆盖", value: new Set(updates.map((update) => update.type)).size },
          ]}
        />

        {updates.length === 0 ? (
          <CollectionEmptyState
            title="还没有公开动态"
            body="后台 `Update` collection 已经可用。发布内容后，这里会自动形成一条时间顺序的动态流。"
          />
        ) : (
          <section className="sunny-card rounded-[1.6rem] p-5 sm:p-6 md:rounded-[2.2rem] md:p-8">
            <div className="relative">
              <div className="absolute left-5 top-4 bottom-4 hidden w-px bg-[linear-gradient(180deg,rgba(24,34,44,0.14),rgba(24,34,44,0.02))] md:block" />

              <div className="space-y-4 md:space-y-5">
                {updates.map((update) => (
                  <article key={update.id} className="relative rounded-[1.3rem] border border-border bg-white/60 p-4 sm:p-5 md:ml-12 md:rounded-[1.7rem] md:p-6">
                    <div className="absolute -left-[2.55rem] top-7 hidden h-4 w-4 rounded-full border-4 border-background bg-accent md:block" />
                    <div className="flex flex-col items-start gap-2 text-xs text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                      <span className="sunny-badge sunny-badge-accent">{update.type}</span>
                      <span>{formatDate(update.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-[0.97rem] leading-7 text-foreground md:text-[1.02rem] md:leading-8">{update.content}</p>
                    {update.link ? (
                      <a
                        className="mt-4 inline-flex text-sm font-semibold text-accent-strong"
                        href={update.link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        查看关联链接
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
