import type { Metadata } from "next";

import { EditorStyles } from "@/components/editor/EditorStyles";
import { CommandPalette } from "@/components/public/CommandPalette";
import { SiteThemeProvider } from "@/components/public/SiteThemeProvider";
import "../globals.css";
import { getSiteLocale } from "@/lib/site-locale";
import { getSitePalette } from "@/lib/site-palette-server";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description: "Writing, notes, and timeline — a personal panel.",
  openGraph: {
    description: "Writing, notes, and timeline.",
    title: "SunnyPanel",
    type: "website",
    url: "/",
  },
  title: "SunnyPanel",
};

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getSiteLocale();
  const palette = await getSitePalette();

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      data-palette={palette}
      data-scroll-behavior="smooth"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col sunny-shell">
        <SiteThemeProvider initialLocale={locale} initialPalette={palette}>
          <EditorStyles />
          {children}
          <CommandPalette locale={locale} />
        </SiteThemeProvider>
      </body>
    </html>
  );
}
