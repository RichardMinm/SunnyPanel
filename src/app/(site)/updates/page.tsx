import { PublicCollectionEmptySwitch } from "@/components/public/PublicCollectionEmptySwitch";
import { PublicListPage } from "@/components/public/PublicListPage";
import { SectionIntro } from "@/components/public/SectionIntro";
import { UpdateCard } from "@/components/public/UpdateCard";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicUpdates } from "@/lib/payload/public";

export const revalidate = 60;

export default async function UpdatesPage() {
  const { docs: updates } = await getPublicUpdates();

  return (
    <PublicListPage className="gap-6 md:gap-8">
      {({ locale }) => {
        const copy = getSiteCopy(locale);
        const linkedCount = updates.filter((update) => Boolean(update.link)).length;

        return (
          <>
            <SectionIntro
              eyebrow="Updates"
              stats={[
                { label: copy.updates.statsUpdates, value: updates.length },
                { label: copy.updates.statsLinked, value: linkedCount },
                { label: copy.updates.statsTypes, value: new Set(updates.map((update) => update.type)).size },
              ]}
              title="Updates"
            />

            <PublicCollectionEmptySwitch
              body={copy.updates.emptyBody}
              isEmpty={updates.length === 0}
              title={copy.updates.emptyTitle}
            >
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
            </PublicCollectionEmptySwitch>
          </>
        );
      }}
    </PublicListPage>
  );
}
