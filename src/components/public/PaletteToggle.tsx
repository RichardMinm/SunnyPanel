"use client";

import { useRouter } from "next/navigation";
import { useTransition, type CSSProperties } from "react";

import { applySitePalette, getPaletteOptions, type SitePalette } from "@/lib/site-palette";
import { getPaletteSwitchClasses, type SunnyChromeVariant } from "@/components/shared/segmented-switch-classes";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type PaletteToggleProps = {
  currentPalette: SitePalette;
  locale: SiteLocale;
  onPaletteChange?: (palette: SitePalette) => void;
  variant?: SunnyChromeVariant;
};

export function PaletteToggle({ currentPalette, locale, onPaletteChange, variant = "site" }: PaletteToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const copy = getSiteCopy(locale);
  const options = getPaletteOptions(locale);
  const classes = getPaletteSwitchClasses(variant);

  const switchPalette = (palette: SitePalette) => {
    if (palette === currentPalette) {
      return;
    }

    applySitePalette(palette);
    onPaletteChange?.(palette);

    fetch("/api/site-palette", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ palette }),
    }).then(() => {
      startTransition(() => {
        router.refresh();
      });
    });
  };

  return (
    <div className={classes.root} aria-label={copy.common.paletteLabel} role="listbox">
      {options.map((option) => {
        const isActive = option.id === currentPalette;

        return (
          <button
            key={option.id}
            aria-selected={isActive}
            className={`${classes.option}${isActive ? " is-active" : ""}`}
            disabled={isPending}
            onClick={() => switchPalette(option.id)}
            role="option"
            style={
              {
                "--palette-preview": option.swatch,
                "--palette-preview-secondary": option.swatchSecondary,
              } as CSSProperties
            }
            type="button"
          >
            <span aria-hidden="true" className="sunny-palette-swatch" />
            <span className="sunny-palette-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
