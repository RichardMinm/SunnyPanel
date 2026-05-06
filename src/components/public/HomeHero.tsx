import Link from "next/link";

import { StatusBadge } from "@/components/ui/SunnyComponents";
import type { SiteLocale } from "@/lib/site-copy";

const homeHeroCopy = {
  en: {
    about: "About",
    aboutHref: "/about",
    body:
      "A personal operating system for writing, planning, remembering, and reviewing. The public site shows the living surface; the private workspace keeps the work moving.",
    primary: "See Now",
    secondary: "Read Writing",
    signal: "Public Personal System",
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
      "一个用于写作、计划、记忆和复盘的个人操作系统。公开站点承载可阅读的表层，私有工作台负责把每天的行动继续往前推。",
    primary: "查看 Now",
    secondary: "阅读写作",
    signal: "Public Personal System",
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

export function HomeHero({ locale }: { locale: SiteLocale }) {
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
