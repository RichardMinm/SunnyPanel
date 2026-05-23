"use client";

import { useLayoutEffect } from "react";

import { applySitePalette, readSitePaletteFromCookie, type SitePalette } from "@/lib/site-palette";

type SitePaletteSyncProps = {
  initialPalette?: SitePalette;
};

export function SitePaletteSync({ initialPalette }: SitePaletteSyncProps) {
  useLayoutEffect(() => {
    const palette = initialPalette ?? readSitePaletteFromCookie(document.cookie);

    applySitePalette(palette);
  }, [initialPalette]);

  return null;
}
