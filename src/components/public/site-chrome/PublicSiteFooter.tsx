import Link from "next/link";

import { getFooterNavItems } from "@/lib/site-nav";
import type { SiteLocale } from "@/lib/site-copy";

export function PublicSiteFooter({ locale }: { locale: SiteLocale }) {
  const footerItems = getFooterNavItems(locale);

  return (
    <footer className="mt-8 rounded-xl border border-border/80 bg-white/45 px-4 py-4 backdrop-blur md:mt-9 md:rounded-xl md:px-6 md:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted">SunnyPanel</p>

        <div className="flex flex-wrap gap-3 text-sm text-muted">
          {footerItems.map((item) =>
            item.href === "/dashboard" ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a key={item.href} href={item.href} className="sunny-nav-link px-0 py-0 hover:bg-transparent">
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                scroll={false}
                className="sunny-nav-link px-0 py-0 hover:bg-transparent"
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
