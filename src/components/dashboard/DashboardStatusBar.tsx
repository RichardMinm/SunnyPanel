"use client";

import type { WritingSaveStatusSnapshot } from "@/components/dashboard/writing/writing-types";
import { formatWritingSaveStatusDisplay } from "@/lib/dashboard/writing-save-status";

export type DashboardStatusBarProps = {
  /** 当前分支名 */
  branch?: string;
  /** 是否为生产环境 */
  isProduction?: boolean;
  /** 模型名称 */
  model?: string;
  /** 搜索入口是否可用 */
  searchAvailable?: boolean;
  /** 状态文本，如"已就绪"、"执行中" */
  statusLabel: string;
  /** 当前 thread ID（仅开发环境显示） */
  threadId?: null | number;
  /** Token 用量摘要（仅开发环境显示） */
  tokenSummary?: string;
  /** 写作模式 autosave 状态 */
  writingStatus?: null | WritingSaveStatusSnapshot;
  /** 写作模式：隐藏开发者信息，仅显示写作统计 */
  isWritingMode?: boolean;
};

function formatUserStatus(statusLabel: string): string {
  if (statusLabel === "已就绪") return "Sunny 已就绪";
  if (statusLabel === "执行中") return "Sunny 正在执行";
  if (statusLabel === "思考中") return "Sunny 正在思考";
  if (statusLabel === "需要确认") return "Sunny 等待确认";
  return `Sunny · ${statusLabel}`;
}

const formatWritingStatus = (writingStatus: WritingSaveStatusSnapshot) =>
  formatWritingSaveStatusDisplay(writingStatus);

export function DashboardStatusBar({
  isWritingMode = false,
  searchAvailable = true,
  statusLabel,
  writingStatus,
}: DashboardStatusBarProps) {
  const writingStatusDisplay = writingStatus ? formatWritingStatus(writingStatus) : null;

  return (
    <footer className="sunny-dashboard-status-bar" role="status" aria-label="工作台状态">
      <span className="sunny-dashboard-status-dot" aria-hidden="true" />
      {isWritingMode ? (
        <span className="sunny-dashboard-status-writing">{statusLabel}</span>
      ) : (
        <span>{formatUserStatus(statusLabel)}</span>
      )}
      <span style={{ flex: 1 }} />
      {!isWritingMode && writingStatusDisplay ? (
        <span className={writingStatusDisplay.className}>{writingStatusDisplay.label}</span>
      ) : null}
      {searchAvailable ? (
        <span className="sunny-dashboard-status-kbd" aria-hidden="true">⌘K</span>
      ) : null}
    </footer>
  );
}
