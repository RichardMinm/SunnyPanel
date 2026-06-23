import type { SitePalette } from "@/lib/site-palette";

type AdminPaletteBootstrapProps = {
  palette: SitePalette;
};

/** Applies palette to html before React hydration to avoid first-paint flash in Admin. */
export function AdminPaletteBootstrap({ palette }: AdminPaletteBootstrapProps) {
  const script = `(function(){try{document.documentElement.dataset.palette=${JSON.stringify(palette)}}catch(e){}})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
