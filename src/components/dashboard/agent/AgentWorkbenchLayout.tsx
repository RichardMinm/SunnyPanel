import type { ReactNode } from "react";

type AgentWorkbenchLayoutProps = {
  center: ReactNode;
  dataTestId?: string;
  inspector: null | ReactNode;
  sidebar: ReactNode;
};

export function AgentWorkbenchLayout({ center, dataTestId, inspector, sidebar }: AgentWorkbenchLayoutProps) {
  return (
    <section
      className={`sunny-agent-workbench-layout${inspector ? "" : " sunny-agent-workbench-layout--no-inspector"}`}
      data-testid={dataTestId}
    >
      {sidebar}
      <main className="sunny-agent-center-surface">{center}</main>
      {inspector}
    </section>
  );
}
