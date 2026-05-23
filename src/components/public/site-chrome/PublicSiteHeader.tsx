"use client";

import Link from "next/link";
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
};

export function PublicSiteHeader({ locale: localeProp, palette: paletteProp }: PublicSiteHeaderProps) {
  const preferences = useOptionalSitePreferences();
  const locale = localeProp ?? preferences?.locale ?? "zh";
  const palette = paletteProp ?? preferences?.palette ?? "cobalt";
  const pathname = usePathname();
  const copy = getSiteCopy(locale);
  const navigation = getPublicNavItems(locale);
  const workspaceItems = getWorkspaceNavItems(locale);
  const workspaceActive = workspaceItems.some((item) => isNavActive(pathname, item.href));

  return (
    <header className="sunny-public-header relative z-40 overflow-visible rounded-lg px-3 py-3 md:px-5 md:py-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start">
          <SiteBrand locale={locale} variant="site" />

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <HeaderWorkspaceActions
              locale={locale}
              palette={palette}
              pathname={pathname}
              workspaceActive={workspaceActive}
              workspaceItems={workspaceItems}
            />
          </div>
        </div>

        <div className="min-w-0">
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

        <div className="hidden shrink-0 items-center justify-end gap-2 lg:flex">
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
