import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";
import { parseCookieValue } from "@/lib/site-cookies";

export const sitePaletteCookieName = "site-palette";

export const defaultSitePalette = "cobalt" as const;

export const sitePalettes = ["cobalt", "forest", "wine", "midnight", "slate"] as const;

export type SitePalette = (typeof sitePalettes)[number];

const paletteSwatches: Record<
  SitePalette,
  { primary: string; secondary: string; darkPrimary: string; darkSecondary: string }
> = {
  cobalt: { primary: "#2457aa", secondary: "#183e7a", darkPrimary: "#5b9cf5", darkSecondary: "#0c1220" },
  forest: { primary: "#2d6a4f", secondary: "#1b4332", darkPrimary: "#6ecf9a", darkSecondary: "#0a100d" },
  wine: { primary: "#922b3e", secondary: "#6b1f2e", darkPrimary: "#d48494", darkSecondary: "#140e11" },
  midnight: { primary: "#9a7b2f", secondary: "#1a2744", darkPrimary: "#c9a227", darkSecondary: "#080a10" },
  slate: { primary: "#4f46e5", secondary: "#3730a3", darkPrimary: "#9498f5", darkSecondary: "#0c0c0f" },
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
    swatchDark: paletteSwatches[id].darkPrimary,
    swatchDarkSecondary: paletteSwatches[id].darkSecondary,
  }));
}
