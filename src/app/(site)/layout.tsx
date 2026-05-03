import type { Metadata } from "next";

import { CommandPalette } from "@/components/public/CommandPalette";
import { SiteThemeProvider } from "@/components/public/SiteThemeProvider";
import "../globals.css";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata: Metadata = {
  title: "SunnyPanel",
  description: "A personal panel system for publishing, reflection, and private planning.",
};

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getSiteLocale();

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      data-scroll-behavior="smooth"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col sunny-shell">
        <SiteThemeProvider>
          {children}
          <CommandPalette locale={locale} />
        </SiteThemeProvider>
      </body>
    </html>
  );
}
