import { NextResponse } from "next/server";

import { defaultSitePalette, resolveSitePalette, sitePaletteCookieName } from "@/lib/site-palette";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { palette?: string } | null;
  const palette = resolveSitePalette(body?.palette);

  const response = NextResponse.json({ ok: true, palette });
  response.cookies.set(sitePaletteCookieName, palette ?? defaultSitePalette, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
