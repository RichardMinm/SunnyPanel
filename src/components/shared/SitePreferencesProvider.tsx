"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

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
  const [locale, setLocale] = useState(initialLocale);
  const [palette, setPalette] = useState(initialPalette);

  useLayoutEffect(() => {
    if (!hydrateFromCookies) {
      return;
    }

    const nextLocale = readSiteLocaleFromDocument();
    const nextPalette = readSitePaletteFromDocument();

    applySitePalette(nextPalette);
    setLocale(nextLocale);
    setPalette(nextPalette);
  }, [hydrateFromCookies]);

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    setPalette(initialPalette);
  }, [initialPalette]);

  const value = useMemo(
    () => ({
      locale,
      palette,
      setLocale,
      setPalette,
    }),
    [locale, palette],
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
