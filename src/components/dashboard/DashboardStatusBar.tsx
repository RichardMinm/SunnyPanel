"use client";

export type DashboardStatusBarProps = {
  /** 当前分支名 */
  branch?: string;
  /** 模型名称 */
  model?: string;
  /** 搜索入口是否可用 */
  searchAvailable?: boolean;
  /** 状态文本，如"就绪"、"运行中" */
  statusLabel: string;
  /** 上下文 token 数（格式化后的字符串，如 "2.4k tokens"） */
  tokenCount?: string;
};

export function DashboardStatusBar({
  branch = "main",
  model = "DeepSeek V3",
  searchAvailable = true,
  statusLabel,
  tokenCount,
}: DashboardStatusBarProps) {
  return (
    <footer className="sunny-dashboard-status-bar" role="status" aria-label="工作台状态">
      <span className="sunny-dashboard-status-dot" aria-hidden="true" />
      <span>{model}</span>
      <span aria-hidden="true">|</span>
      <span>{branch}</span>
      <span style={{ flex: 1 }} />
      {searchAvailable ? (
        <>
          <span aria-hidden="true">⌘K</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      {tokenCount ? (
        <>
          <span>上下文 {tokenCount}</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      <span>{statusLabel}</span>
    </footer>
  );
}
