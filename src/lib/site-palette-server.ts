import "server-only";

import { cookies } from "next/headers";

import { resolveSitePalette, sitePaletteCookieName, type SitePalette } from "@/lib/site-palette";

export async function getSitePalette(): Promise<SitePalette> {
  const cookieStore = await cookies();

  return resolveSitePalette(cookieStore.get(sitePaletteCookieName)?.value);
}
