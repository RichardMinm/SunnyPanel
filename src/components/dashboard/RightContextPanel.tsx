"use client";

import { DashboardSlidePanel, type DashboardSlidePanelProps } from "./DashboardSlidePanel";

export type RightContextPanelProps = DashboardSlidePanelProps;

export function RightContextPanel(props: RightContextPanelProps) {
  return <DashboardSlidePanel {...props} />;
}
