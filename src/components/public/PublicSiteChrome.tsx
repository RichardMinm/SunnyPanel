"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";

import { SettingsMenu } from "@/components/public/SettingsMenu";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

export function PublicSiteHeader({ locale }: { locale: SiteLocale }) {
  const pathname = usePathname();
  const copy = getSiteCopy(locale);
  const navigation = [
    { href: "/", label: copy.nav.home },
    { href: "/about", label: copy.nav.about },
    { href: "/now", label: copy.nav.now },
    { href: "/checklists", label: copy.nav.checklists },
    { href: "/blog", label: copy.nav.blog },
    { href: "/notes", label: copy.nav.notes },
    { href: "/updates", label: copy.nav.updates },
    { href: "/timeline", label: copy.nav.timeline },
  ];

  return (
    <motion.header
      className="sunny-panel relative z-40 overflow-visible rounded-[1.45rem] px-3 py-3 md:rounded-[1.7rem] md:px-6 md:py-3.5"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="group inline-flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-accent text-sm font-bold text-white shadow-[0_10px_24px_rgba(143,53,16,0.18)] transition group-hover:-translate-y-0.5 md:h-10 md:w-10">
              S
            </span>
            <div className="min-w-0">
              <p className="sunny-kicker text-[0.68rem] text-accent-strong">SunnyPanel</p>
              <p className="truncate text-[0.78rem] text-muted md:text-[0.82rem]">{copy.frame.tagline}</p>
            </div>
          </Link>
        </div>

        <div className="-mx-1 overflow-x-auto pb-1">
          <nav className="flex min-w-max flex-nowrap gap-1 px-1">
            {navigation.map((item, index) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.04 * index, ease: "easeOut" }}
              >
                <Link
                  href={item.href}
                  className={`sunny-nav-link shrink-0 whitespace-nowrap ${
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                      ? "sunny-nav-link-active"
                      : ""
                  }`}
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <SettingsMenu locale={locale} />
            <Link href="/dashboard" className="sunny-button-secondary w-full sm:w-auto">
              {copy.frame.dashboard}
            </Link>
            <Link href="/admin" className="sunny-button-primary w-full sm:w-auto">
              {copy.frame.admin}
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

export function PublicSiteFooter({ locale }: { locale: SiteLocale }) {
  const copy = getSiteCopy(locale);

  return (
    <footer className="mt-8 rounded-[1.45rem] border border-border/80 bg-white/45 px-4 py-4 backdrop-blur md:mt-9 md:rounded-[1.8rem] md:px-6 md:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[0.82rem] text-muted md:text-sm">SunnyPanel</p>

        <div className="flex flex-wrap gap-3 text-[0.9rem] text-muted md:text-sm">
          <Link href="/blog" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerBlog}
          </Link>
          <Link href="/timeline" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerTimeline}
          </Link>
          <Link href="/dashboard" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerWorkspace}
          </Link>
        </div>
      </div>
    </footer>
  );
}
