"use client";

import type { ReactNode } from "react";

import { SunnyAppProviders } from "@/components/shared/SunnyAppProviders";
import type { SiteLocale } from "@/lib/site-copy";
import type { SitePalette } from "@/lib/site-palette";

type SunnyAdminProvidersClientProps = {
  children: ReactNode;
  initialLocale: SiteLocale;
  initialPalette: SitePalette;
};

export function SunnyAdminProvidersClient({
  children,
  initialLocale,
  initialPalette,
}: SunnyAdminProvidersClientProps) {
  return (
    <SunnyAppProviders
      hydrateFromCookies
      initialLocale={initialLocale}
      initialPalette={initialPalette}
      withPreferences
    >
      {children}
    </SunnyAppProviders>
  );
}
