"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { readSiteLocaleFromDocument, readSitePaletteFromDocument } from "@/lib/site-cookies";
import type { SiteLocale } from "@/lib/site-copy";
import { applySitePalette } from "@/lib/site-palette";
import type { SitePalette } from "@/lib/site-palette";

type SitePreferencesContextValue = {
  locale: SiteLocale;
  palette: SitePalette;
  setLocale: (locale: SiteLocale) => void;
  setPalette: (palette: SitePalette) => void;
};

const SitePreferencesContext = createContext<SitePreferencesContextValue | null>(null);

type SitePreferencesProviderProps = {
  children: ReactNode;
  hydrateFromCookies?: boolean;
  initialLocale: SiteLocale;
  initialPalette: SitePalette;
};

export function SitePreferencesProvider({
  children,
  hydrateFromCookies = false,
  initialLocale,
  initialPalette,
}: SitePreferencesProviderProps) {
  const [localeOverride, setLocaleOverride] = useState<SiteLocale | null>(() =>
    hydrateFromCookies && typeof document !== "undefined" ? readSiteLocaleFromDocument() : null,
  );
  const [paletteOverride, setPaletteOverride] = useState<SitePalette | null>(() =>
    hydrateFromCookies && typeof document !== "undefined" ? readSitePaletteFromDocument() : null,
  );
  const locale = localeOverride ?? initialLocale;
  const palette = paletteOverride ?? initialPalette;

  useLayoutEffect(() => {
    applySitePalette(palette);
  }, [palette]);

  const setLocale = useCallback((nextLocale: SiteLocale) => {
    setLocaleOverride(nextLocale);
  }, []);

  const setPalette = useCallback((nextPalette: SitePalette) => {
    setPaletteOverride(nextPalette);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      palette,
      setLocale,
      setPalette,
    }),
    [locale, palette, setLocale, setPalette],
  );

  return <SitePreferencesContext.Provider value={value}>{children}</SitePreferencesContext.Provider>;
}

export function useSitePreferences() {
  const context = useContext(SitePreferencesContext);

  if (!context) {
    throw new Error("useSitePreferences must be used within SitePreferencesProvider");
  }

  return context;
}

export function useOptionalSitePreferences() {
  return useContext(SitePreferencesContext);
}
