"use client";

import type { ReactNode } from "react";

type MainWorkspaceProps = {
  children: ReactNode;
};

export function MainWorkspace({ children }: MainWorkspaceProps) {
  return (
    <main className="sunny-dashboard-main sunny-main-workspace">
      {children}
    </main>
  );
}
