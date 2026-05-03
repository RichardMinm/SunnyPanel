import { HomeModuleSwitcher } from "@/components/public/HomeModuleSwitcher";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { TimelineHighlight } from "@/components/public/TimelineHighlight";
import { getSiteLocale } from "@/lib/site-locale";
import { getPublicChecklists, getPublicTimelineEvents, getPublicUpdates } from "@/lib/payload/public";

export const dynamic = "force-dynamic";

export default async function Home() {
  const locale = await getSiteLocale();
  const [checklists, updates, featuredTimeline] = await Promise.all([
    getPublicChecklists({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
  ]);

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <TimelineHighlight events={featuredTimeline.docs} locale={locale} />
        <HomeModuleSwitcher
          checklists={checklists.docs}
          featuredTimeline={featuredTimeline.docs}
          locale={locale}
          updates={updates.docs}
        />
      </main>
    </PublicSiteFrame>
  );
}
