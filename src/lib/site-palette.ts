import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";
import { parseCookieValue } from "@/lib/site-cookies";

export const sitePaletteCookieName = "site-palette";

export const defaultSitePalette = "cobalt" as const;

export const sitePalettes = ["cobalt", "forest", "wine", "midnight", "slate"] as const;

export type SitePalette = (typeof sitePalettes)[number];

const paletteSwatches: Record<SitePalette, { primary: string; secondary: string }> = {
  cobalt: { primary: "#2457aa", secondary: "#183e7a" },
  forest: { primary: "#2d6a4f", secondary: "#1b4332" },
  wine: { primary: "#922b3e", secondary: "#6b1f2e" },
  midnight: { primary: "#9a7b2f", secondary: "#1a2744" },
  slate: { primary: "#4f46e5", secondary: "#3730a3" },
};

export function resolveSitePalette(value: unknown): SitePalette {
  if (typeof value === "string" && sitePalettes.includes(value as SitePalette)) {
    return value as SitePalette;
  }

  return defaultSitePalette;
}

export function readSitePaletteFromCookie(cookieHeader?: string | null): SitePalette {
  return resolveSitePalette(parseCookieValue(cookieHeader ?? "", sitePaletteCookieName));
}

export function applySitePalette(palette: SitePalette) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.palette = palette;
}

export function getPaletteOptions(locale: SiteLocale) {
  const labels = getSiteCopy(locale).common.palettes;

  return sitePalettes.map((id) => ({
    id,
    label: labels[id],
    swatch: paletteSwatches[id].primary,
    swatchSecondary: paletteSwatches[id].secondary,
  }));
}
