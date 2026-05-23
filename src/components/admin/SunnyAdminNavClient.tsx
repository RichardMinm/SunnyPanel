"use client";

import { getTranslation } from "@payloadcms/translations";
import { BrowseByFolderButton, Link, NavGroup, useConfig, useTranslation } from "@payloadcms/ui";
import { EntityType, type groupNavItems } from "@payloadcms/ui/shared";
import type { NavPreferences } from "payload";
import { usePathname } from "next/navigation";
import { formatAdminURL } from "payload/shared";

import { useOptionalSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { getAdminNavGroupLabel } from "@/lib/admin-nav";
import { ADMIN_NAV_GROUP, type AdminNavGroupKey } from "@/lib/payload/admin-groups";
import type { SiteLocale } from "@/lib/site-copy";

const baseClass = "nav";

type SunnyAdminNavClientProps = {
  groups: ReturnType<typeof groupNavItems>;
  initialSiteLocale: SiteLocale;
  navPreferences: NavPreferences | null;
};

function resolveStableGroupKey(label: Parameters<typeof getTranslation>[0] | string): string {
  if (typeof label === "string") {
    return label;
  }

  return "";
}

function isAdminNavGroupKey(value: string): value is AdminNavGroupKey {
  return value in ADMIN_NAV_GROUP;
}

export function SunnyAdminNavClient({ groups, initialSiteLocale, navPreferences }: SunnyAdminNavClientProps) {
  const pathname = usePathname();
  const preferences = useOptionalSitePreferences();
  const siteLocale = preferences?.locale ?? initialSiteLocale;
  const {
    config: {
      admin: {
        routes: { browseByFolder: foldersRoute },
      },
      folders,
      routes: { admin: adminRoute },
    },
  } = useConfig();
  const { i18n } = useTranslation();

  const folderURL = formatAdminURL({
    adminRoute,
    path: foldersRoute,
  });
  const viewingRootFolderView = pathname.startsWith(folderURL);

  const resolveGroupLabel = (label: Parameters<typeof getTranslation>[0] | string) => {
    const stableKey = resolveStableGroupKey(label);
    const lookupKey = isAdminNavGroupKey(stableKey) ? stableKey : stableKey;

    if (lookupKey && isAdminNavGroupKey(lookupKey)) {
      return getAdminNavGroupLabel(siteLocale, lookupKey);
    }

    const raw = typeof label === "string" ? label : getTranslation(label, i18n);

    return typeof raw === "string" ? raw : "";
  };

  return (
    <>
      {typeof folders === "object" && folders?.browseByFolder ? (
        <BrowseByFolderButton active={viewingRootFolderView} />
      ) : null}
      {groups.map((group) => {
        const stableGroupKey = resolveStableGroupKey(group.label);
        const groupLabel = resolveGroupLabel(group.label);
        const preferenceKey = isAdminNavGroupKey(stableGroupKey) ? stableGroupKey : groupLabel;

        return (
          <NavGroup
            key={preferenceKey}
            isOpen={navPreferences?.groups?.[preferenceKey]?.open ?? navPreferences?.groups?.[stableGroupKey]?.open}
            label={groupLabel}
          >
            {group.entities.map((entity, index) => {
              const { slug, type, label: entityLabel } = entity;

              let href = "";
              let id = "";

              if (type === EntityType.collection) {
                href = formatAdminURL({ adminRoute, path: `/collections/${slug}` });
                id = `nav-${slug}`;
              }

              if (type === EntityType.global) {
                href = formatAdminURL({ adminRoute, path: `/globals/${slug}` });
                id = `nav-global-${slug}`;
              }

              const isActive = pathname.startsWith(href) && ["/", undefined].includes(pathname[href.length]);
              const labelContent = (
                <>
                  {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
                  <span className={`${baseClass}__link-label`}>{getTranslation(entityLabel, i18n)}</span>
                </>
              );

              if (pathname === href) {
                return (
                  <div key={id || index} className={`${baseClass}__link`} id={id}>
                    {labelContent}
                  </div>
                );
              }

              return (
                <Link key={id || index} className={`${baseClass}__link`} href={href} id={id} prefetch={false}>
                  {labelContent}
                </Link>
              );
            })}
          </NavGroup>
        );
      })}
    </>
  );
}
