"use client";

import { useTheme } from "next-themes";

import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";

type ThemeValue = "dark" | "light" | "system";

const themeOrder: ThemeValue[] = ["light", "dark", "system"];

export function ThemeToggle({ locale }: { locale: SiteLocale }) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const copy = getSiteCopy(locale);
  const currentTheme = (theme ?? "system") as ThemeValue;

  return (
    <div className="sunny-locale-switch" aria-label={copy.common.themeLabel} role="group">
      {themeOrder.map((value) => {
        const isActive =
          currentTheme === value || (currentTheme === "system" && value === "system" && Boolean(resolvedTheme));

        const label =
          value === "light"
            ? copy.common.themeLight
            : value === "dark"
              ? copy.common.themeDark
              : copy.common.themeSystem;

        return (
          <button
            key={value}
            className={`sunny-locale-option ${isActive ? "sunny-locale-option-active" : ""}`}
            onClick={() => setTheme(value)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
