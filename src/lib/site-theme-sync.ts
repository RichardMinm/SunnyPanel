"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Ensures the theme follows the system when set to "system".
 *
 * next-themes v0.4.x uses the deprecated matchMedia.addListener()
 * to watch prefers-color-scheme changes. In newer browsers (Safari 14+)
 * this may silently fail. This hook adds a modern addEventListener-based
 * watcher as a safety net.
 */
export function useSystemThemeSync() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      // When the system preference changes and the user has chosen
      // "system", re-resolve by calling setTheme("system") again.
      // next-themes will pick up the new system value.
      if (theme === "system") {
        setTheme("system");
      }
    };

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [theme, setTheme]);
}
