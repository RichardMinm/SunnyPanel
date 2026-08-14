import { Logout } from "@payloadcms/ui";
import { RenderServerComponent } from "@payloadcms/ui/elements/RenderServerComponent";
import { EntityType, groupNavItems } from "@payloadcms/ui/shared";
import { NavWrapper } from "@payloadcms/next/client";
import type { DefaultNav } from "@payloadcms/next/rsc";
import Link from "next/link";
import React from "react";

import { SunnyAdminNavClient } from "@/components/admin/SunnyAdminNavClient";
import { SunnyAdminSettingsMenuButton } from "@/components/admin/SunnyAdminSettingsMenuButton";
import { getAdminWorkspaceCopy } from "@/lib/admin-nav";
import { getNavPrefs } from "@/lib/payload/get-nav-prefs";
import { readSiteLocaleFromRequest } from "@/lib/site-cookies";

const baseClass = "nav";

type SunnyAdminNavProps = React.ComponentProps<typeof DefaultNav>;

export async function SunnyAdminNav(props: SunnyAdminNavProps) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props;

  if (!payload?.config || !visibleEntities || !permissions) {
    return null;
  }

  const {
    admin: {
      components: { afterNav, afterNavLinks, beforeNav, beforeNavLinks, logout, settingsMenu },
    },
    collections,
    globals,
  } = payload.config;

  const navEntities = [
    ...collections
      .filter(({ slug }) => visibleEntities.collections.includes(slug))
      .map((collection) => ({
        type: EntityType.collection,
        entity: collection,
      })),
    ...globals
      .filter(({ slug }) => visibleEntities.globals.includes(slug))
      .map((global) => ({
        type: EntityType.global,
        entity: global,
      })),
  ] as Parameters<typeof groupNavItems>[0];

  const groups = groupNavItems(navEntities, permissions, i18n);

  const navPreferences = await getNavPrefs(req);
  const siteLocale = readSiteLocaleFromRequest(req);
  const workspaceCopy = getAdminWorkspaceCopy(siteLocale);

  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    user,
  };
  const clientProps = { documentSubViewType, viewType };

  const LogoutComponent = RenderServerComponent({
    clientProps,
    Component: logout?.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedSettingsMenu =
    settingsMenu && Array.isArray(settingsMenu)
      ? settingsMenu.map((item, index) =>
          RenderServerComponent({
            clientProps,
            Component: item,
            importMap: payload.importMap,
            key: `settings-menu-item-${index}`,
            serverProps,
          }),
        )
      : [];

  const renderSlot = (Component: typeof beforeNav) =>
    RenderServerComponent({
      clientProps,
      Component,
      importMap: payload.importMap,
      serverProps,
    });

  return (
    <div className="sunny-admin-nav-shell">
      <NavWrapper baseClass={baseClass}>
        {renderSlot(beforeNav)}
        <nav className={`${baseClass}__wrap`}>
          {renderSlot(beforeNavLinks)}
          <div className="sunny-admin-workspace-strip">
            <p className="sunny-chrome-section-label sunny-admin-workspace-strip-label">{workspaceCopy.dailyWork}</p>
            <Link href="/dashboard" className="sunny-admin-workspace-back">
              <span aria-hidden="true" className="sunny-admin-workspace-back-icon">
                ←
              </span>
              {workspaceCopy.backToDashboard}
            </Link>
            <Link href="/dashboard?mode=writing" className="sunny-admin-workspace-back">
              <span aria-hidden="true" className="sunny-admin-workspace-back-icon">
                W
              </span>
              {workspaceCopy.writingStudio}
            </Link>
          </div>
          <SunnyAdminNavClient groups={groups} initialSiteLocale={siteLocale} navPreferences={navPreferences} />
          {renderSlot(afterNavLinks)}
          <div className={`${baseClass}__controls`}>
            <SunnyAdminSettingsMenuButton settingsMenu={RenderedSettingsMenu} />
            {LogoutComponent}
          </div>
        </nav>
        {renderSlot(afterNav)}
      </NavWrapper>
    </div>
  );
}
