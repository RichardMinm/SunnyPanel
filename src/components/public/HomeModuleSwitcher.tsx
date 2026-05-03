"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Checklist, TimelineEvent, Update } from "@/payload-types";

import { ChecklistPreviewCard } from "@/components/public/ChecklistPreviewCard";
import { UpdateCard } from "@/components/public/UpdateCard";
import { EmptyState, SectionHeader, SurfaceCard, TimelineMiniCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type HomeModuleId = "checklists" | "timeline" | "updates";

type HomeModuleSwitcherProps = {
  checklists: Checklist[];
  featuredTimeline: TimelineEvent[];
  locale: SiteLocale;
  updates: Update[];
};

export function HomeModuleSwitcher({
  checklists,
  featuredTimeline,
  locale,
  updates,
}: HomeModuleSwitcherProps) {
  const copy = getSiteCopy(locale);
  const [activeModule, setActiveModule] = useState<HomeModuleId>("checklists");

  const modules = [
    {
      count: checklists.length,
      description: copy.home.checklistDescription,
      empty: copy.home.checklistEmpty,
      href: "/checklists",
      id: "checklists" as const,
      label: copy.nav.checklists,
      title: copy.home.checklistTitle,
    },
    {
      count: updates.length,
      description: copy.home.updatesDescription,
      empty: copy.home.updatesEmpty,
      href: "/updates",
      id: "updates" as const,
      label: copy.nav.updates,
      title: copy.home.updatesTitle,
    },
    {
      count: featuredTimeline.length,
      description: copy.home.timelineDescription,
      empty: copy.home.timelineEmpty,
      href: "/timeline",
      id: "timeline" as const,
      label: copy.nav.timeline,
      title: copy.home.timelineTitle,
    },
  ];

  const activeModuleConfig = modules.find((module) => module.id === activeModule) ?? modules[0];
  const openLabel =
    locale === "en" ? `Open ${activeModuleConfig.label}` : `打开${activeModuleConfig.label}`;

  return (
    <SurfaceCard as="section" variant="default">
      <SectionHeader
        action={
          <Link href={activeModuleConfig.href} className="sunny-button-secondary">
            {openLabel}
          </Link>
        }
        description={activeModuleConfig.description}
        kicker={locale === "en" ? "Home Modules" : "首页模块"}
        size="lg"
        title={activeModuleConfig.title}
      />

      <div
        aria-label={locale === "en" ? "Homepage modules" : "首页模块"}
        className="mt-6 flex flex-wrap gap-2"
        role="tablist"
      >
        {modules.map((module) => {
          const isActive = module.id === activeModule;

          return (
            <button
              key={module.id}
              aria-selected={isActive}
              className="relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white"
              onClick={() => setActiveModule(module.id)}
              role="tab"
              type="button"
            >
              {isActive ? (
                <motion.span
                  className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(196,94,35,0.18),rgba(255,255,255,0.88))]"
                  layoutId="home-module-pill"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                />
              ) : null}
              <span className="relative z-10">{module.label}</span>
              <span className="relative z-10 rounded-full bg-white/85 px-2.5 py-0.5 text-xs text-muted shadow-[0_2px_8px_rgba(24,34,44,0.06)]">
                {module.count}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div className="mt-6" layout transition={{ duration: 0.28, ease: "easeOut" }}>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={activeModule}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {activeModule === "checklists" ? (
              checklists.length > 0 ? (
                <div className="grid gap-3 md:gap-4 xl:grid-cols-2">
                  {checklists.map((checklist) => (
                    <ChecklistPreviewCard key={checklist.id} checklist={checklist} locale={locale} />
                  ))}
                </div>
              ) : (
                <EmptyState description={activeModuleConfig.empty} />
              )
            ) : null}

            {activeModule === "updates" ? (
              updates.length > 0 ? (
                <div className="space-y-3 md:space-y-4">
                  {updates.map((update) => (
                    <UpdateCard key={update.id} locale={locale} update={update} variant="home" />
                  ))}
                </div>
              ) : (
                <EmptyState description={activeModuleConfig.empty} />
              )
            ) : null}

            {activeModule === "timeline" ? (
              featuredTimeline.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-3 md:gap-4">
                  {featuredTimeline.map((event) => (
                    <TimelineMiniCard
                      key={event.id}
                      date={formatShortDate(event.eventDate, locale)}
                      description={
                        event.description ||
                        (locale === "en"
                          ? "This event currently acts as a lightweight milestone in the public narrative."
                          : "这条节点目前作为公开叙事中的一个轻量里程碑存在。")
                      }
                      href="/timeline"
                      title={event.title}
                      type={event.type}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState description={activeModuleConfig.empty} />
              )
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </SurfaceCard>
  );
}
