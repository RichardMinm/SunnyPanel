"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { AgentApprovalPanel } from "@/components/dashboard/agent/AgentApprovalPanel";
import { AgentContextPanel } from "@/components/dashboard/agent/AgentContextPanel";
import { AgentTracePanel } from "@/components/dashboard/agent/AgentTracePanel";
import { inspectorTabs } from "@/components/dashboard/agent/constants";
import type { AgentRollbackExecutionResult } from "@/components/dashboard/agent/rollback-display";
import type { AgentInspectorTab, AgentRunDetail, ContextPreferences } from "@/components/dashboard/agent/types";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

type DashboardRightPanelProps = {
  action: null | ProposedAgentAction;
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences: ContextPreferences;
  debugMode: boolean;
  inputTokenEstimate: number;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackPayload?: null | unknown;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  onArtifactsRollback?: () => void;
  onInspectorTabChange: (tab: AgentInspectorTab) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTogglePanel: () => void;
  onRollbackSelectedRun?: () => void;
  onToggleContextExclude: (key: string) => void;
  onToggleContextPin: (key: string) => void;
  panelOpen: boolean;
  pendingAction: null | PendingAction;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  workbenchMode: AgentWorkbenchMode;
};

const modeLabelMap: Record<AgentWorkbenchMode, string> = {
  ask: "自动模式",
  answer: "只回答",
  execute: "执行模式",
  plan: "规划模式",
  review: "回顾模式",
  timeline: "时间线模式",
  today: "今日模式",
  writing: "写作模式",
};

function DashboardInspectorToggleIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55">
        <path d="M4.75 5.25h10.5v9.5H4.75z" />
        <path d="M11.25 5.25v9.5" />
        {open ? <path d="m8.25 8 2 2-2 2" /> : <path d="m14 8-2 2 2 2" />}
      </g>
    </svg>
  );
}

function LinkedObjectsPanel({
  action,
  debugMode,
  selectedRunDetail,
}: {
  action: null | ProposedAgentAction;
  debugMode: boolean;
  selectedRunDetail?: AgentRunDetail | null;
}) {
  const affected = action?.affectedDocuments ?? action?.changes ?? [];

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-linked-panel">
      <div className="sunny-agent-context-grid-v2">
        <span>关联计划</span>
        <strong>{affected.some((item) => item.collection === "plans") ? "已关联" : "暂无"}</strong>
        <span>关联日程</span>
        <strong>{affected.some((item) => item.collection === "schedule-items") ? "已关联" : "暂无"}</strong>
        <span>关联笔记</span>
        <strong>{affected.some((item) => item.collection === "notes") ? "已关联" : "暂无"}</strong>
        <span>关联文章</span>
        <strong>{affected.some((item) => item.collection === "posts") ? "已关联" : "暂无"}</strong>
      </div>
      {debugMode && selectedRunDetail ? (
        <div className="sunny-agent-inspector-summary">
          <span>当前执行记录</span>
          <h3>{selectedRunDetail.title}</h3>
          <p>{selectedRunDetail.impactSummary ?? selectedRunDetail.summary ?? "这条执行记录暂未提供关联摘要。"}</p>
        </div>
      ) : (
        <div className="sunny-agent-inspector-empty">
          <h3>暂无关联对象</h3>
          <p>当本轮操作关联计划、日程、笔记或文章时，会在这里显示。</p>
        </div>
      )}
    </div>
  );
}

function MemoryInspectorPanel({ debugMode, traceSteps }: { debugMode: boolean; traceSteps: AgentTraceStep[] }) {
  if (!debugMode) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>长期记忆</h3>
        <p>调试开启后会显示本轮使用的长期记忆详情。</p>
      </div>
    );
  }

  const memoryTitles = traceSteps
    .filter((step) => step.kind === "context" && step.detail)
    .flatMap((step) => {
      const match = step.detail?.match(/命中记忆：(.+)/);
      return match ? match[1].split("、").map((item) => item.trim()).filter(Boolean) : [];
    });

  if (memoryTitles.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>当前对话未使用长期记忆</h3>
        <p>当 Agent 命中长期记忆时，会在这里列出被使用的记忆标题。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-memory-inspector-panel">
      <div className="sunny-agent-inspector-summary">
        <span>已使用记忆</span>
        <h3>{memoryTitles.length} 条长期记忆</h3>
      </div>
      <ul className="sunny-agent-memory-inspector-list">
        {memoryTitles.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
    </div>
  );
}

export function DashboardRightPanel({
  action,
  activeInspectorTab,
  artifactsRollbackBusy = false,
  artifactsRollbackError = null,
  contextPreferences,
  debugMode,
  inputTokenEstimate,
  latestAssistantMessage,
  lastRollbackPayload = null,
  lastRollbackResult = null,
  messages,
  onArtifactsRollback,
  onInspectorTabChange,
  onResizeStart,
  onTogglePanel,
  onRollbackSelectedRun,
  onToggleContextExclude,
  onToggleContextPin,
  panelOpen,
  pendingAction,
  selectedRunDetail = null,
  selectedRunRollbackBusy = false,
  selectedRunRollbackError = null,
  statusLabel,
  threadId,
  tokenUsage,
  traceSteps,
  workbenchMode,
}: DashboardRightPanelProps) {
  return (
    <>
      <aside className="sunny-dashboard-right-panel sunny-right-context-panel" aria-label="右侧检查器">
        {onResizeStart ? (
          <button
            type="button"
            className="sunny-context-panel-resize-handle"
            aria-label="调整右侧面板宽度"
            onPointerDown={onResizeStart}
          />
        ) : null}
        <div className="sunny-dashboard-right-panel-head">
          <div>
            <p>检查器</p>
            <h2>{inspectorTabs.find((tab) => tab.key === activeInspectorTab)?.label ?? "上下文"}</h2>
          </div>
          <div className="sunny-dashboard-right-panel-actions">
            <button
              type="button"
              className="sunny-dashboard-right-panel-toggle"
              aria-label="收起检查器"
              title="收起检查器"
              onClick={onTogglePanel}
            >
              <DashboardInspectorToggleIcon open />
            </button>
          </div>
        </div>
        <div className="sunny-agent-inspector-tabs sunny-dashboard-right-tabs" role="tablist" aria-label="Agent 详情面板">
          {inspectorTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeInspectorTab === tab.key}
              className={activeInspectorTab === tab.key ? "active" : ""}
              onClick={() => onInspectorTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="sunny-dashboard-right-panel-body">
          {activeInspectorTab === "context" ? (
            <AgentContextPanel
              contextPreferences={contextPreferences}
              messages={messages}
              onToggleExclude={onToggleContextExclude}
              onTogglePin={onToggleContextPin}
              pendingAction={pendingAction}
              debugMode={debugMode}
              statusLabel={
                debugMode
                  ? `${statusLabel} · ${modeLabelMap[workbenchMode]} · 上下文约 ${tokenUsage.contextTokens} tokens · 输入约 ${inputTokenEstimate} tokens`
                  : statusLabel
              }
              threadId={threadId}
              traceSteps={traceSteps}
            />
          ) : null}
          {activeInspectorTab === "approval" ? <AgentApprovalPanel action={action} pendingAction={pendingAction} /> : null}
          {activeInspectorTab === "trace" ? (
            <AgentTracePanel
              action={action}
              artifactsRollbackBusy={artifactsRollbackBusy}
              artifactsRollbackError={artifactsRollbackError}
              latestAssistantMessage={latestAssistantMessage}
              lastRollbackPayload={lastRollbackPayload}
              lastRollbackResult={lastRollbackResult}
              onArtifactsRollback={onArtifactsRollback}
              onRollbackSelectedRun={onRollbackSelectedRun}
              selectedRunDetail={selectedRunDetail}
              selectedRunRollbackBusy={selectedRunRollbackBusy}
              selectedRunRollbackError={selectedRunRollbackError}
              debugMode={debugMode}
              statusLabel={statusLabel}
              traceSteps={traceSteps}
            />
          ) : null}
          {activeInspectorTab === "linked" ? <LinkedObjectsPanel action={action} debugMode={debugMode} selectedRunDetail={selectedRunDetail} /> : null}
          {activeInspectorTab === "memory" ? <MemoryInspectorPanel debugMode={debugMode} traceSteps={traceSteps} /> : null}
        </div>
      </aside>
      <button
        type="button"
        className={`sunny-dashboard-inspector-toggle${panelOpen ? " is-active" : ""}`}
        aria-label={panelOpen ? "收起检查器" : "展开检查器"}
        title={panelOpen ? "收起检查器" : "展开检查器"}
        onClick={onTogglePanel}
      >
        <DashboardInspectorToggleIcon open={panelOpen} />
      </button>
    </>
  );
}
