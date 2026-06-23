"use client";

import { usePathname } from "next/navigation";

import { SettingsMenu } from "@/components/public/SettingsMenu";
import { PublicNavDropdown } from "@/components/public/site-chrome/PublicNavDropdown";
import { PublicNavLink } from "@/components/public/site-chrome/PublicNavLink";
import { SiteBrand } from "@/components/shared/SiteBrand";
import { useOptionalSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { getPublicNavItems, getWorkspaceNavItems, isNavActive } from "@/lib/site-nav";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type PublicSiteHeaderProps = {
  locale?: SiteLocale;
  palette?: SitePalette;
  variant?: "site" | "admin";
};

export function PublicSiteHeader({
  locale: localeProp,
  palette: paletteProp,
  variant = "site",
}: PublicSiteHeaderProps) {
  const preferences = useOptionalSitePreferences();
  const locale = localeProp ?? preferences?.locale ?? "zh";
  const palette = paletteProp ?? preferences?.palette ?? "cobalt";
  const pathname = usePathname();
  const navigation = getPublicNavItems(locale);
  const workspaceItems = getWorkspaceNavItems(locale, variant === "admin" ? { inAdmin: true } : undefined);
  const workspaceActive =
    variant === "admin"
      ? pathname.startsWith("/admin") || workspaceItems.some((item) => isNavActive(pathname, item.href))
      : workspaceItems.some((item) => isNavActive(pathname, item.href));

  return (
    <header className="sunny-public-header rounded-lg">
      <div className="sunny-public-header-inner">
        <div className="sunny-public-header-brand-row">
          <SiteBrand locale={locale} />

          <div className="sunny-public-header-actions sunny-public-header-actions--mobile">
            <HeaderWorkspaceActions
              locale={locale}
              palette={palette}
              pathname={pathname}
              workspaceActive={workspaceActive}
              workspaceItems={workspaceItems}
            />
          </div>
        </div>

        <div className="sunny-public-header-nav-wrap">
          <nav className="sunny-public-nav-scroll flex gap-1 overflow-x-auto pb-1 lg:flex-wrap lg:justify-center lg:overflow-visible lg:pb-0">
            {navigation.map((item) => (
              <PublicNavLink
                key={item.href}
                active={isNavActive(pathname, item.href)}
                href={item.href}
                label={item.label}
              />
            ))}
          </nav>
        </div>

        <div className="sunny-public-header-actions sunny-public-header-actions--desktop">
          <HeaderWorkspaceActions
            locale={locale}
            palette={palette}
            pathname={pathname}
            workspaceActive={workspaceActive}
            workspaceItems={workspaceItems}
          />
        </div>
      </div>
    </header>
  );
}

function HeaderWorkspaceActions({
  locale,
  palette,
  pathname,
  workspaceActive,
  workspaceItems,
}: {
  locale: SiteLocale;
  palette: SitePalette;
  pathname: string;
  workspaceActive: boolean;
  workspaceItems: Array<{ href: string; label: string }>;
}) {
  const copy = getSiteCopy(locale);
  const preferences = useOptionalSitePreferences();

  return (
    <>
      <SettingsMenu
        locale={locale}
        palette={palette}
        onLocaleChange={preferences?.setLocale}
        onPaletteChange={preferences?.setPalette}
      />
      <PublicNavDropdown
        active={workspaceActive}
        align="right"
        compact
        items={workspaceItems}
        label={copy.frame.footerWorkspace}
        pathname={pathname}
      />
    </>
  );
}
