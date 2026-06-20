import type { ReactNode } from "react";

import { SunnyAdminProvidersClient } from "@/components/admin/SunnyAdminProvidersClient";
import { getSiteLocale } from "@/lib/site-locale";
import { getSitePalette } from "@/lib/site-palette-server";

type SunnyAdminProvidersProps = {
  children: ReactNode;
};

export async function SunnyAdminProviders({ children }: SunnyAdminProvidersProps) {
  const [initialLocale, initialPalette] = await Promise.all([getSiteLocale(), getSitePalette()]);

  return (
    <SunnyAdminProvidersClient initialLocale={initialLocale} initialPalette={initialPalette}>
      {children}
    </SunnyAdminProvidersClient>
  );
}
