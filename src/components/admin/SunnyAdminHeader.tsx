"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteBrand } from "@/components/shared/SiteBrand";
import { SiteSettingsMenu } from "@/components/shared/SiteSettingsMenu";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { getSiteCopy } from "@/lib/site-copy";
import { getPublicNavItems, getWorkspaceNavItems, isNavActive } from "@/lib/site-nav";

export function SunnyAdminHeader() {
  const pathname = usePathname();
  const { locale, palette, setLocale, setPalette } = useSitePreferences();

  const copy = getSiteCopy(locale);
  const publicNav = getPublicNavItems(locale);
  const workspaceNav = getWorkspaceNavItems(locale, { inAdmin: true });

  return (
    <header className="sunny-chrome-header sunny-admin-header">
      <div className="sunny-chrome-header-inner">
        <SiteBrand locale={locale} variant="admin" />

        <nav className="sunny-chrome-header-nav" aria-label={copy.common.siteNavLabel}>
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sunny-chrome-nav-link${isNavActive(pathname, item.href) ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sunny-chrome-header-actions">
          {workspaceNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sunny-chrome-workspace-link${isNavActive(pathname, item.href) ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}

          <SiteSettingsMenu
            locale={locale}
            palette={palette}
            onLocaleChange={setLocale}
            onPaletteChange={setPalette}
            variant="admin"
          />
        </div>
      </div>
    </header>
  );
}
