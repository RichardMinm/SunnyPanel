import { NextResponse } from "next/server";

import { defaultSiteLocale, resolveSiteLocale, siteLocaleCookieName } from "@/lib/site-copy";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { locale?: string } | null;
  const locale = resolveSiteLocale(body?.locale);

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(siteLocaleCookieName, locale ?? defaultSiteLocale, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
