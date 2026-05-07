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
      "This is the public surface of a long-running personal system: what I am writing, what I am trying to remember, and where the next quiet step is pointing.",
    focusKicker: "Current Focus",
    focusLabel: "Focus",
    memoryLabel: "Memory Status",
    primary: "See Now",
    recentLabel: "Recent Action",
    secondary: "Read Writing",
    signal: "Public Personal System",
    statusText: "A small trail is being kept.",
    title: "SunnyPanel",
    visualLabel: "SunnyPanel system map",
    lanes: [
      {
        body: "Posts, notes, and updates stay close to the timeline.",
        label: "Write",
      },
      {
        body: "Plans and reviews turn private work into visible progress.",
        label: "Plan",
      },
      {
        body: "Milestones become a memory layer that can be revisited.",
        label: "Remember",
      },
    ],
  },
  zh: {
    about: "About",
    aboutHref: "/about",
    body:
      "这里是一个长期个人系统的公开表层：我正在写什么、想记住什么，以及下一步安静地指向哪里。",
    focusKicker: "Current Focus",
    focusLabel: "当前焦点",
    memoryLabel: "记忆状态",
    primary: "查看 Now",
    recentLabel: "最近动作",
    secondary: "阅读写作",
    signal: "Public Personal System",
    statusText: "仍在留下一条可以回看的线索。",
    title: "SunnyPanel",
    visualLabel: "SunnyPanel 系统结构",
    lanes: [
      {
        body: "文章、短札和动态不再散落，而是贴着时间线持续生长。",
        label: "写作",
      },
      {
        body: "计划、清单和复盘把私有工作变成可持续推进的行动。",
        label: "计划",
      },
      {
        body: "关键节点沉淀成记忆层，方便之后回看阶段变化。",
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
              <p className="sunny-kicker text-[0.68rem] text-muted">{copy.focusKicker}</p>
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
