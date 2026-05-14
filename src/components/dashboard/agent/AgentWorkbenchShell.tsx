import type { ReactNode } from "react";

import { AgentWorkbenchLayout } from "./AgentWorkbenchLayout";

type AgentWorkbenchShellProps = {
  center: ReactNode;
  dataTestId?: string;
  /** 窄屏时 Inspector 以抽屉挂载在布局外，此处传 null 以收缩栅格 */
  inspector: null | ReactNode;
  inspectorDrawer: boolean;
  sidebar: ReactNode;
};

/**
 * 工作台外壳：三栏栅格 + 窄屏时 Inspector 抽屉（由 `inspectorDrawer` 控制是否把第三栏移出主栅格）。
 */
export function AgentWorkbenchShell({
  center,
  dataTestId,
  inspector,
  inspectorDrawer,
  sidebar,
}: AgentWorkbenchShellProps) {
  return (
    <>
      <AgentWorkbenchLayout
        center={center}
        dataTestId={dataTestId}
        inspector={inspectorDrawer ? null : inspector}
        sidebar={sidebar}
      />
      {inspectorDrawer ? inspector : null}
    </>
  );
}
