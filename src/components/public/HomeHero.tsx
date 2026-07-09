import Link from "next/link";

import { StatusBadge } from "@/components/ui/SunnyComponents";
import type { SiteLocale } from "@/lib/site-copy";

export type HomeHeroSignal = {
  date?: string;
  description: string;
  href: string;
  label: string;
  title: string;
};

export type HomeHeroFocus = {
  focus: HomeHeroSignal;
  lastUpdated?: string;
  recentAction: HomeHeroSignal;
};

const homeHeroCopy = {
  en: {
    about: "About",
    aboutHref: "/about",
    body:
      "Writing, notes, and timeline — the public surface of a personal panel.",
    focusKicker: "Current Focus",
    focusLabel: "Focus",
    memoryLabel: "Recent",
    primary: "See Now",
    recentLabel: "Recent",
    secondary: "Read Writing",
    signal: "SunnyPanel",
    statusText: "Public writing, notes, and timeline events.",
    title: "SunnyPanel",
    visualLabel: "SunnyPanel structure",
    lanes: [
      {
        body: "Published posts and notes, ordered by time.",
        label: "Write",
      },
      {
        body: "Private plans, checklists, and reviews stay in the workspace.",
        label: "Plan",
      },
      {
        body: "Key milestones form a revisitable memory backbone.",
        label: "Remember",
      },
    ],
  },
  zh: {
    about: "About",
    aboutHref: "/about",
    body:
      "写作、笔记与时间线 — 个人面板的公开表层。",
    focusKicker: "Current Focus",
    focusLabel: "当前焦点",
    memoryLabel: "最近更新",
    primary: "查看 Now",
    recentLabel: "最近动态",
    secondary: "阅读写作",
    signal: "SunnyPanel",
    statusText: "公开文章、笔记与时间线节点。",
    title: "SunnyPanel",
    visualLabel: "SunnyPanel 结构",
    lanes: [
      {
        body: "已发布的文章和笔记，按时间排列。",
        label: "写作",
      },
      {
        body: "计划、清单和复盘留在私有工作台。",
        label: "计划",
      },
      {
        body: "关键节点构成可回看的记忆骨架。",
        label: "记忆",
      },
    ],
  },
} as const;

export function HomeHero({
  currentFocus,
  locale,
}: {
  currentFocus: HomeHeroFocus;
  locale: SiteLocale;
}) {
  const copy = homeHeroCopy[locale];

  return (
    <section className="sunny-home-hero">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="accent">{copy.signal}</StatusBadge>
          <Link href={copy.aboutHref} className="sunny-home-hero-text-link">
            {copy.about}
          </Link>
        </div>

        <h1 className="mt-5 text-4xl font-semibold leading-tight text-foreground md:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted md:text-lg md:leading-9">
          {copy.body}
        </p>

        <div className="sunny-home-current-state">
          <div className="sunny-home-current-head">
            <div>
              <p className="sunny-kicker text-muted">{copy.focusKicker}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{copy.statusText}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <StatusBadge tone="accent">{copy.memoryLabel}</StatusBadge>
              {currentFocus.lastUpdated ? <span className="text-xs text-muted">{currentFocus.lastUpdated}</span> : null}
            </div>
          </div>

          <div className="sunny-home-current-grid">
            <Link href={currentFocus.focus.href} className="sunny-home-current-item sunny-home-current-item-primary">
              <span className="sunny-home-current-label">{copy.focusLabel}</span>
              <h2 className="sunny-dashboard-title mt-2 text-base font-semibold text-foreground">
                {currentFocus.focus.title}
              </h2>
              <p className="sunny-dashboard-clamp mt-1 text-sm leading-6 text-muted">
                {currentFocus.focus.description}
              </p>
              <span className="mt-3 inline-flex">
                <StatusBadge tone="info">{currentFocus.focus.label}</StatusBadge>
              </span>
            </Link>

            <Link href={currentFocus.recentAction.href} className="sunny-home-current-item">
              <span className="sunny-home-current-label">{copy.recentLabel}</span>
              <h3 className="sunny-dashboard-title mt-2 text-sm font-semibold text-foreground">
                {currentFocus.recentAction.title}
              </h3>
              <p className="sunny-dashboard-clamp mt-1 text-xs leading-5 text-muted">
                {currentFocus.recentAction.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{currentFocus.recentAction.label}</StatusBadge>
                {currentFocus.recentAction.date ? <span className="text-xs text-muted">{currentFocus.recentAction.date}</span> : null}
              </div>
            </Link>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/now" className="sunny-button-primary">
            {copy.primary}
          </Link>
          <Link href="/blog" className="sunny-button-secondary">
            {copy.secondary}
          </Link>
        </div>
      </div>

      <div aria-label={copy.visualLabel} className="sunny-home-system-map">
        {copy.lanes.map((lane, index) => (
          <div key={lane.label} className="sunny-home-system-row">
            <span className="sunny-home-system-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{lane.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{lane.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
