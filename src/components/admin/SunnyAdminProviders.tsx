"use client";

import type { ReactNode } from "react";

import { SunnyAppProviders } from "@/components/shared/SunnyAppProviders";
import { defaultSiteLocale } from "@/lib/site-copy";
import { defaultSitePalette } from "@/lib/site-palette";

type SunnyAdminProvidersProps = {
  children: ReactNode;
};

export function SunnyAdminProviders({ children }: SunnyAdminProvidersProps) {
  return (
    <SunnyAppProviders
      hydrateFromCookies
      initialLocale={defaultSiteLocale}
      initialPalette={defaultSitePalette}
      withPreferences
    >
      {children}
    </SunnyAppProviders>
  );
}
