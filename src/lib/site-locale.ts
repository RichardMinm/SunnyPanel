import "server-only";

import { cookies } from "next/headers";

import { resolveSiteLocale, siteLocaleCookieName, type SiteLocale } from "./site-copy";

export async function getSiteLocale(): Promise<SiteLocale> {
  const cookieStore = await cookies();
  return resolveSiteLocale(cookieStore.get(siteLocaleCookieName)?.value);
}
