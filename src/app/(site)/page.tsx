import type { Metadata } from "next";

import { HomeHero, type HomeHeroFocus, type HomeHeroSignal } from "@/components/public/HomeHero";
import { HomeModuleSwitcher } from "@/components/public/HomeModuleSwitcher";
import { LatestWriting } from "@/components/public/LatestWriting";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { TimelineHighlight } from "@/components/public/TimelineHighlight";
import { formatShortDate } from "@/lib/formatters";
import { stripMarkdownForExcerpt } from "@/lib/markdown/plain-text";
import { getContentMarkdownFallback } from "@/lib/rich-content/compat";
import { getSiteLocale } from "@/lib/site-locale";
import {
  getPublicChecklists,
  getPublicNotes,
  getPublicPostsWithOptions,
  getPublicTimelineEvents,
  getPublicUpdates,
} from "@/lib/payload/public";

export const revalidate = 60;

const excerpt = (value: null | string | undefined, fallback: string, maxLength = 120) => {
  const normalized = (value || fallback).replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
};

type DatedHomeHeroSignal = {
  signal: HomeHeroSignal;
  sortDate: string;
};

export const generateMetadata = async (): Promise<Metadata> => ({
  description: "个人工作台与知识管理 — SunnyPanel",
  title: "SunnyPanel",
});

export default async function Home() {
  const locale = await getSiteLocale();
  const [checklists, posts, notes, updates, featuredTimeline] = await Promise.all([
    getPublicChecklists({ limit: 4 }),
    getPublicPostsWithOptions({ limit: 4 }),
    getPublicNotes({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
  ]);
  const latestSignals: DatedHomeHeroSignal[] = [
    ...posts.docs.map((post) => ({
      signal: {
        date: formatShortDate(post.publishedAt ?? post.createdAt, locale),
        description: excerpt(post.summary, locale === "en" ? "New long-form writing is ready to read." : "新的长篇写作已经整理出来。"),
        href: `/blog/${post.slug}`,
        label: locale === "en" ? "Writing" : "写作",
        title: post.title,
      } satisfies HomeHeroSignal,
      sortDate: post.publishedAt ?? post.createdAt,
    })),
    ...notes.docs.map((note) => ({
      signal: {
        date: formatShortDate(note.createdAt, locale),
        description: excerpt(
          stripMarkdownForExcerpt(getContentMarkdownFallback(note)),
          locale === "en" ? "A small note was added to the public memory stream." : "新的短札已经进入公开记忆流。",
        ),
        href: "/notes",
        label: locale === "en" ? "Note" : "短札",
        title: note.category || note.mood || (locale === "en" ? "Recent Note" : "最近短札"),
      } satisfies HomeHeroSignal,
      sortDate: note.createdAt,
    })),
    ...updates.docs.map((update) => ({
      signal: {
        date: formatShortDate(update.createdAt, locale),
        description: excerpt(
          stripMarkdownForExcerpt(getContentMarkdownFallback(update)),
          locale === "en" ? "A new public update was recorded." : "新的公开动态已经记录。",
        ),
        href: "/updates",
        label: update.type,
        title: locale === "en" ? "Latest Update" : "最近动态",
      } satisfies HomeHeroSignal,
      sortDate: update.createdAt,
    })),
    ...featuredTimeline.docs.map((event) => ({
      signal: {
        date: formatShortDate(event.eventDate, locale),
        description: excerpt(event.description, locale === "en" ? "A featured milestone anchors the current memory layer." : "一个精选节点正在作为当前记忆锚点。"),
        href: "/timeline?featured=1",
        label: locale === "en" ? "Timeline" : "时间线",
        title: event.title,
      } satisfies HomeHeroSignal,
      sortDate: event.eventDate,
    })),
  ].sort((first, second) => new Date(second.sortDate).getTime() - new Date(first.sortDate).getTime());
  const fallbackSignal: DatedHomeHeroSignal = {
    signal: {
      description:
        locale === "en"
          ? "The public surface is ready for the next piece of writing, memory, or plan."
          : "公开表层已经准备好承接下一条写作、记忆或计划线索。",
      href: "/now",
      label: locale === "en" ? "Now" : "Now",
      title: locale === "en" ? "Keep the personal system alive" : "让个人系统继续生长",
    },
    sortDate: new Date().toISOString(),
  };
  const focusSignal: DatedHomeHeroSignal =
    checklists.docs[0]
      ? {
          signal: {
            date: formatShortDate(checklists.docs[0].updatedAt, locale),
            description: excerpt(
              checklists.docs[0].summary,
              locale === "en"
                ? "A public checklist is currently carrying the clearest thread of ongoing work."
                : "这份公开清单正在承接眼前最清晰的一条长期线索。",
            ),
            href: "/checklists",
            label: locale === "en" ? "Checklist" : "清单",
            title: checklists.docs[0].title,
          },
          sortDate: checklists.docs[0].updatedAt,
        }
      : latestSignals[0] ?? fallbackSignal;
  const recentAction = latestSignals.find((item) => item.signal.href !== focusSignal.signal.href) ?? latestSignals[0] ?? fallbackSignal;
  const currentFocus: HomeHeroFocus = {
    focus: focusSignal.signal,
    lastUpdated: formatShortDate([focusSignal, recentAction].sort((first, second) => new Date(second.sortDate).getTime() - new Date(first.sortDate).getTime())[0].sortDate, locale),
    recentAction: recentAction.signal,
  };

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <HomeHero currentFocus={currentFocus} locale={locale} />
        <TimelineHighlight events={featuredTimeline.docs} locale={locale} />
        <LatestWriting
          locale={locale}
          notes={notes.docs}
          posts={posts.docs}
          updates={updates.docs}
        />
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
