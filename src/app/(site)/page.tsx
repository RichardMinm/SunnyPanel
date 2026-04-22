import { ChecklistPreviewCard } from "@/components/public/ChecklistPreviewCard";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { UpdateCard } from "@/components/public/UpdateCard";
import { getSiteLocale } from "@/lib/site-locale";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicChecklists, getPublicUpdates } from "@/lib/payload/public";

export default async function Home() {
  const locale = await getSiteLocale();
  const copy = getSiteCopy(locale);
  const [checklists, updates] = await Promise.all([
    getPublicChecklists({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
  ]);

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:gap-6">
          <div className="sunny-card rounded-[1.55rem] p-5 sm:p-6 md:rounded-[1.9rem] md:p-7">
            <div>
              <div>
                <p className="sunny-kicker text-xs text-muted">Checklist</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">{copy.home.checklistTitle}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {copy.home.checklistDescription}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:mt-6 md:gap-4">
              {checklists.docs.length > 0 ? (
                checklists.docs.map((checklist) => (
                  <ChecklistPreviewCard key={checklist.id} checklist={checklist} locale={locale} />
                ))
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border bg-white/45 px-5 py-5 text-sm leading-7 text-muted">
                  {copy.home.checklistEmpty}
                </div>
              )}
            </div>
          </div>

          <div className="sunny-card rounded-[1.55rem] p-5 sm:p-6 md:rounded-[1.9rem] md:p-7">
            <div>
              <div>
                <p className="sunny-kicker text-xs text-muted">Updates</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">{copy.home.updatesTitle}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {copy.home.updatesDescription}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 md:mt-6 md:space-y-4">
              {updates.docs.length > 0 ? (
                updates.docs.map((update) => (
                  <UpdateCard key={update.id} locale={locale} update={update} variant="home" />
                ))
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border bg-white/45 px-5 py-5 text-sm leading-7 text-muted">
                  {copy.home.updatesEmpty}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
