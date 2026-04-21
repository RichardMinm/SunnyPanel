"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { LocaleToggle } from "@/components/public/LocaleToggle";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type PublicSiteFrameProps = {
  children: ReactNode;
  locale: SiteLocale;
};

export function PublicSiteFrame({ children, locale }: PublicSiteFrameProps) {
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
    <div className="mx-auto flex w-full max-w-[74rem] flex-1 flex-col px-3 py-3 sm:px-4 md:px-6 lg:px-8">
      <header className="sunny-panel rounded-[1.45rem] px-3 py-3 md:rounded-[1.7rem] md:px-6 md:py-3.5">
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
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sunny-nav-link shrink-0 whitespace-nowrap ${
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                      ? "sunny-nav-link-active"
                      : ""
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[0.72rem] font-semibold text-muted">{copy.common.localeLabel}</span>
              <LocaleToggle currentLocale={locale} label={copy.common.localeLabel} />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Link href="/dashboard" className="sunny-button-secondary w-full sm:w-auto">
                {copy.frame.dashboard}
              </Link>
              <Link href="/admin" className="sunny-button-primary w-full sm:w-auto">
                {copy.frame.admin}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-5 flex-1 md:mt-6">{children}</div>

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
    </div>
  );
}
