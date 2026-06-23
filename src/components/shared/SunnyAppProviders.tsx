"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import { AppTooltipProvider } from "@/components/primitives/AppTooltip";
import { SitePaletteSync } from "@/components/public/SitePaletteSync";
import { SitePreferencesProvider } from "@/components/shared/SitePreferencesProvider";
import { defaultSiteLocale } from "@/lib/site-copy";
import type { SiteLocale } from "@/lib/site-copy";
import { defaultSitePalette, type SitePalette } from "@/lib/site-palette";
import { SUNNY_THEME_STORAGE_KEY } from "@/lib/site-theme";
import { useSystemThemeSync } from "@/lib/site-theme-sync";

type SunnyAppProvidersProps = {
  children: ReactNode;
  hydrateFromCookies?: boolean;
  initialLocale?: SiteLocale;
  initialPalette?: SitePalette;
  withPreferences?: boolean;
};

export function SunnyAppProviders({
  children,
  hydrateFromCookies = false,
  initialLocale = defaultSiteLocale,
  initialPalette = defaultSitePalette,
  withPreferences = false,
}: SunnyAppProvidersProps) {
  const content = (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey={SUNNY_THEME_STORAGE_KEY}
    >
      <AppTooltipProvider>
        <ThemeSync />
        <SitePaletteSync initialPalette={initialPalette} />
        {children}
      </AppTooltipProvider>
    </ThemeProvider>
  );

  if (!withPreferences) {
    return content;
  }

  return (
    <SitePreferencesProvider
      hydrateFromCookies={hydrateFromCookies}
      initialLocale={initialLocale}
      initialPalette={initialPalette}
    >
      {content}
    </SitePreferencesProvider>
  );
}

/** Bridges next-themes' deprecated addListener with modern matchMedia API. */
function ThemeSync() {
  useSystemThemeSync();
  return null;
}
