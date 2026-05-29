import type { SiteLocale } from "@/lib/site-copy";
import { getSiteCopy } from "@/lib/site-copy";

export type SiteNavItem = {
  href: string;
  label: string;
};

type WorkspaceNavOptions = {
  inAdmin?: boolean;
};

export function getPublicNavItems(locale: SiteLocale): SiteNavItem[] {
  const copy = getSiteCopy(locale);

  return [
    { href: "/", label: copy.nav.home },
    { href: "/now", label: copy.nav.now },
    { href: "/blog", label: copy.nav.writing },
    { href: "/timeline", label: copy.nav.timeline },
    { href: "/projects", label: copy.nav.projects },
    { href: "/about", label: copy.nav.about },
  ];
}

export function getWorkspaceNavItems(locale: SiteLocale, options?: WorkspaceNavOptions): SiteNavItem[] {
  const copy = getSiteCopy(locale);

  const items: SiteNavItem[] = [{ href: "/dashboard", label: copy.frame.dashboard }];

  if (!options?.inAdmin) {
    items.push({ href: "/admin/collections/posts", label: copy.frame.admin });
  }

  return items;
}

export function getFooterNavItems(locale: SiteLocale): SiteNavItem[] {
  const copy = getSiteCopy(locale);

  return [
    { href: "/blog", label: copy.frame.footerBlog },
    { href: "/timeline", label: copy.frame.footerTimeline },
    { href: "/dashboard", label: copy.frame.footerWorkspace },
  ];
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
