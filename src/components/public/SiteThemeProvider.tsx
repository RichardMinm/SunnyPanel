"use client";

import type { ReactNode } from "react";

import { SunnyAppProviders } from "@/components/shared/SunnyAppProviders";
import type { SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type SiteThemeProviderProps = {
  children: ReactNode;
  initialLocale: SiteLocale;
  initialPalette: SitePalette;
};

export function SiteThemeProvider({ children, initialLocale, initialPalette }: SiteThemeProviderProps) {
  return (
    <SunnyAppProviders initialLocale={initialLocale} initialPalette={initialPalette} withPreferences>
      {children}
    </SunnyAppProviders>
  );
}
