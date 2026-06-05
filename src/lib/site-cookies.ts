import type { PayloadRequest } from "payload";

import { resolveSiteLocale, siteLocaleCookieName, type SiteLocale } from "@/lib/site-copy";
import { readSitePaletteFromCookie, resolveSitePalette, type SitePalette } from "@/lib/site-palette";

export function parseCookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));

  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function readSiteLocaleFromCookieHeader(cookieHeader?: string | null): SiteLocale {
  return resolveSiteLocale(parseCookieValue(cookieHeader ?? "", siteLocaleCookieName));
}

export function readSiteLocaleFromDocument(): SiteLocale {
  if (typeof document === "undefined") {
    return resolveSiteLocale(undefined);
  }

  return readSiteLocaleFromCookieHeader(document.cookie);
}

export function readSiteLocaleFromRequest(req?: PayloadRequest): SiteLocale {
  return readSiteLocaleFromCookieHeader(req?.headers?.get("cookie"));
}

export function readSitePaletteFromDocument(): SitePalette {
  if (typeof document === "undefined") {
    return resolveSitePalette(undefined);
  }

  return readSitePaletteFromCookie(document.cookie);
}
