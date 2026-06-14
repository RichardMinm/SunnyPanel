"use client";

import { DashboardIconBar, type DashboardIconBarProps } from "./DashboardIconBar";

export type SidebarNavProps = DashboardIconBarProps;

export function SidebarNav(props: SidebarNavProps) {
  return <DashboardIconBar {...props} />;
}
