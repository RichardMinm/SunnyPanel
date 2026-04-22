import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { UpdateCard } from "@/components/public/UpdateCard";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicUpdates } from "@/lib/payload/public";

export default async function UpdatesPage() {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const { docs: updates } = await getPublicUpdates();
  const linkedCount = updates.filter((update) => Boolean(update.link)).length;

  return (
    <PublicSiteFrame locale={locale}>
      <main className="flex flex-1 flex-col gap-6 pb-4 md:gap-8">
        <SectionIntro
          eyebrow="Updates"
          title="Updates"
          stats={[
            { label: copy.updates.statsUpdates, value: updates.length },
            { label: copy.updates.statsLinked, value: linkedCount },
            { label: copy.updates.statsTypes, value: new Set(updates.map((update) => update.type)).size },
          ]}
        />

        {updates.length === 0 ? (
          <CollectionEmptyState
            title={copy.updates.emptyTitle}
            body={copy.updates.emptyBody}
          />
        ) : (
          <section className="sunny-card rounded-[1.6rem] p-5 sm:p-6 md:rounded-[2.2rem] md:p-8">
            <div className="relative">
              <div className="absolute left-5 top-4 bottom-4 hidden w-px bg-[linear-gradient(180deg,rgba(24,34,44,0.14),rgba(24,34,44,0.02))] md:block" />

              <div className="space-y-4 md:space-y-5">
                {updates.map((update) => (
                  <UpdateCard key={update.id} locale={locale} update={update} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
