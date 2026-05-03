"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { SettingsMenu } from "@/components/public/SettingsMenu";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

export function PublicSiteHeader({ locale }: { locale: SiteLocale }) {
  const pathname = usePathname();
  const copy = getSiteCopy(locale);
  const navigation = [
    { href: "/", label: copy.nav.home },
    { href: "/about", label: copy.nav.about },
    { href: "/checklists", label: copy.nav.checklists },
    { href: "/blog", label: copy.nav.blog },
    { href: "/timeline", label: copy.nav.timeline },
  ];
  const streamItems = [
    { href: "/now", label: copy.nav.now },
    { href: "/notes", label: copy.nav.notes },
    { href: "/updates", label: copy.nav.updates },
  ];
  const streamActive = streamItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <header className="sunny-panel relative z-40 overflow-visible rounded-[1.45rem] px-3 py-3 md:rounded-[1.7rem] md:px-6 md:py-3.5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" scroll={false} className="group inline-flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-accent text-sm font-bold text-white shadow-[0_10px_24px_rgba(143,53,16,0.18)] transition group-hover:-translate-y-0.5 md:h-10 md:w-10">
              S
            </span>
            <div className="min-w-0">
              <p className="sunny-kicker text-[0.68rem] text-accent-strong">SunnyPanel</p>
              <p className="truncate text-[0.78rem] text-muted md:text-[0.82rem]">{copy.frame.tagline}</p>
            </div>
          </Link>
        </div>

        <div className="min-w-0">
          <nav className="flex flex-wrap gap-1">
            {navigation.map((item) => (
              <PublicNavLink
                key={item.href}
                active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
                href={item.href}
                label={item.label}
              />
            ))}
            <PublicNavDropdown active={streamActive} items={streamItems} label={copy.nav.stream} pathname={pathname} />
          </nav>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <SettingsMenu locale={locale} />
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/dashboard" className="sunny-button-secondary w-full sm:w-auto">
              {copy.frame.dashboard}
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/admin" className="sunny-button-primary w-full sm:w-auto">
              {copy.frame.admin}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter({ locale }: { locale: SiteLocale }) {
  const copy = getSiteCopy(locale);

  return (
    <footer className="mt-8 rounded-[1.45rem] border border-border/80 bg-white/45 px-4 py-4 backdrop-blur md:mt-9 md:rounded-[1.8rem] md:px-6 md:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[0.82rem] text-muted md:text-sm">SunnyPanel</p>

        <div className="flex flex-wrap gap-3 text-[0.9rem] text-muted md:text-sm">
          <Link href="/blog" scroll={false} className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerBlog}
          </Link>
          <Link href="/timeline" scroll={false} className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerTimeline}
          </Link>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/dashboard" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
            {copy.frame.footerWorkspace}
          </a>
        </div>
      </div>
    </footer>
  );
}

function PublicNavLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`sunny-nav-link max-w-full ${
        active ? "sunny-nav-link-active" : ""
      }`}
    >
      <span>{label}</span>
      <PublicNavPendingIndicator />
    </Link>
  );
}

function PublicNavPendingIndicator() {
  const { pending } = useLinkStatus();

  return <span aria-hidden className={`sunny-link-pending ${pending ? "sunny-link-pending-active" : ""}`} />;
}

function PublicNavDropdown({
  active,
  items,
  label,
  pathname,
}: {
  active: boolean;
  items: Array<{ href: string; label: string }>;
  label: string;
  pathname: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname]);

  return (
    <details ref={detailsRef} className={`sunny-nav-dropdown ${active ? "sunny-nav-dropdown-active" : ""}`}>
      <summary
        className={`sunny-nav-link sunny-nav-dropdown-trigger list-none ${
          active ? "sunny-nav-link-active" : ""
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="sunny-nav-dropdown-caret">▾</span>
      </summary>

      <div className="sunny-nav-dropdown-panel">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            className={`sunny-nav-dropdown-item ${
              pathname === item.href || pathname.startsWith(`${item.href}/`) ? "sunny-nav-dropdown-item-active" : ""
            }`}
          >
            <span>{item.label}</span>
            <PublicNavPendingIndicator />
          </Link>
        ))}
      </div>
    </details>
  );
}
