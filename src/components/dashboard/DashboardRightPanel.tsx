"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";

import { ContextInspector, getInspectorTabLabel } from "@/components/dashboard/agent/ContextInspector";
import { InspectorSearchToolbar } from "@/components/dashboard/agent/InspectorSearchToolbar";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { InspectorPanel } from "@/components/layout/InspectorPanel";
import { COLLECTION_ICON_MAP, DashboardIcon, DEFAULT_COLLECTION_ICON, InspectorPanelIcon } from "./icons";
import type { AgentRollbackExecutionResult } from "@/components/dashboard/agent/rollback-display";
import type { AgentInspectorTab, AgentRunDetail, ContextPreferences } from "@/components/dashboard/agent/types";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";
import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

/* ─── Inspector panels (dynamic: only the active tab's code is downloaded) ─── */

const AgentApprovalPanel = dynamic(
  () => import("@/components/dashboard/agent/AgentApprovalPanel").then((m) => m.AgentApprovalPanel),
);

const AgentContextPanel = dynamic(
  () => import("@/components/dashboard/agent/AgentContextPanel").then((m) => m.AgentContextPanel),
);

const AgentDebugPanel = dynamic(
  () => import("@/components/dashboard/agent/AgentDebugPanel").then((m) => m.AgentDebugPanel),
);

const AgentInboxPanel = dynamic(
  () => import("@/components/dashboard/agent/AgentInboxPanel").then((m) => m.AgentInboxPanel),
);

const AgentOpsPanel = dynamic(
  () => import("@/components/dashboard/agent/AgentOpsPanel").then((m) => m.AgentOpsPanel),
);

const AgentTracePanel = dynamic(
  () => import("@/components/dashboard/agent/AgentTracePanel").then((m) => m.AgentTracePanel),
);

const PersistedPlanListPanel = dynamic(
  () => import("@/components/dashboard/agent/PersistedPlanListPanel").then((m) => m.PersistedPlanListPanel),
);

type DashboardRightPanelProps = {
  action: null | ProposedAgentAction;
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences: ContextPreferences;
  debugMode: boolean;
  inputTokenEstimate: number;
  lastExecutedAction?: null | ProposedAgentAction;
  latestAssistantMessage?: AgentChatMessage;
  lastRollbackSourceRunId?: null | number;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  onArtifactsRollback?: () => void;
  onInspectorTabChange: (tab: AgentInspectorTab) => void;
  onPlanOperatingPrompt?: (prompt: string) => void;
  onPrefillComposer?: (
    prompt: string,
    source?: {
      suggestedPrompt: string;
      suggestionId: number;
    },
  ) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onRollbackSelectedRun?: () => void;
  onToggleContextExclude: (key: string) => void;
  onToggleContextPin: (key: string) => void;
  pendingAction: null | PendingAction;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  turnAudit?: AgentTurnTrace | null;
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

const COLLECTION_LABEL: Record<string, string> = {
  "agent-memories": "记忆",
  checklists: "清单",
  notes: "笔记",
  plans: "计划",
  posts: "文章",
  "schedule-items": "日程",
  "timeline-events": "时间线",
};

const OPERATION_LABEL: Record<string, string> = {
  create: "新建",
  delete: "删除",
  update: "更新",
};

function LinkedObjectsPanel({
  action,
  debugMode,
  selectedRunDetail,
}: {
  action: null | ProposedAgentAction;
  debugMode: boolean;
  selectedRunDetail?: AgentRunDetail | null;
}) {
  const affected = action?.affectedDocuments ?? [];

  if (affected.length === 0) {
    return (
      <div className="sunny-agent-inspector-panel sunny-agent-linked-panel">
        <div className="sunny-agent-inspector-empty">
          <h3>暂无关联对象</h3>
          <p>当本轮操作关联计划、日程、笔记或文章时，会在这里显示。</p>
        </div>
        {debugMode && selectedRunDetail ? (
          <div className="sunny-agent-inspector-summary">
            <span>当前执行记录</span>
            <h3>{selectedRunDetail.title}</h3>
            <p>{selectedRunDetail.impactSummary ?? selectedRunDetail.summary ?? "这条执行记录暂未提供关联摘要。"}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel sunny-agent-linked-panel">
      <ul className="sunny-linked-objects-list">
        {affected.map((doc, index) => {
          const iconName = COLLECTION_ICON_MAP[doc.collection] ?? DEFAULT_COLLECTION_ICON;
          const label = COLLECTION_LABEL[doc.collection] ?? doc.collection;
          const opLabel = OPERATION_LABEL[doc.operation] ?? doc.operation;
          const title = doc.title ?? `${label} #${doc.documentId ?? "?"}`;
          const href = doc.adminHref ?? doc.publicHref;

          return (
            <li key={`${doc.collection}-${doc.documentId ?? index}`}>
              <button
                type="button"
                className="sunny-linked-object-card"
                onClick={() => {
                  if (href) window.open(href, "_blank");
                }}
                title={href ? `打开 ${title}` : undefined}
              >
                <span className="sunny-linked-object-icon"><DashboardIcon name={iconName} /></span>
                <span className="sunny-linked-object-body">
                  <span className="sunny-linked-object-title">{title}</span>
                  <span className="sunny-linked-object-meta">
                    <span className={`sunny-linked-object-badge is-${doc.operation}`}>{opLabel}</span>
                    <span className="sunny-linked-object-collection">{label}</span>
                  </span>
                </span>
                {debugMode ? (
                  <span className="sunny-linked-object-debug">
                    <small>id={doc.documentId ?? "?"}</small>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {debugMode && selectedRunDetail ? (
        <div className="sunny-agent-inspector-summary">
          <span>当前执行记录</span>
          <h3>{selectedRunDetail.title}</h3>
          <p>{selectedRunDetail.impactSummary ?? selectedRunDetail.summary ?? "这条执行记录暂未提供关联摘要。"}</p>
        </div>
      ) : null}
    </div>
  );
}

function MemoryInspectorPanel({ debugMode, traceSteps }: { debugMode: boolean; traceSteps: AgentTraceStep[] }) {
  const memoryTitles = traceSteps
    .filter((step) => step.kind === "context" && step.detail)
    .flatMap((step) => {
      const match = step.detail?.match(/命中记忆：(.+)/);
      return match ? match[1].split("、").map((item) => item.trim()).filter(Boolean) : [];
    });

  // Normal mode: show memory hits if any
  if (!debugMode) {
    if (memoryTitles.length === 0) {
      return (
        <div className="sunny-agent-inspector-empty">
          <h3>本轮未使用长期记忆</h3>
          <p>当 Agent 查询到相关记忆时，会在这里显示。</p>
        </div>
      );
    }

    return (
      <InspectorPanel
        bare
        className="sunny-agent-inspector-panel sunny-agent-memory-inspector-panel"
        subtitle="本轮使用的记忆"
        title={`${memoryTitles.length} 条记忆`}
      >
        <ul className="sunny-agent-memory-inspector-list">
          {memoryTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <p className="sunny-agent-inspector-hint sunny-agent-inspector-hint--compact">
          开启 debug 模式可查看详细匹配信息
        </p>
      </InspectorPanel>
    );
  }

  // Debug mode: show detailed memory hits
  if (memoryTitles.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>当前对话未使用长期记忆</h3>
        <p>当 Agent 命中长期记忆时，会在这里列出被使用的记忆标题。</p>
      </div>
    );
  }

  return (
    <InspectorPanel
      bare
      className="sunny-agent-inspector-panel sunny-agent-memory-inspector-panel"
      subtitle="已使用记忆"
      title={`${memoryTitles.length} 条长期记忆`}
    >
      <ul className="sunny-agent-memory-inspector-list">
        {memoryTitles.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
    </InspectorPanel>
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
  lastExecutedAction = null,
  latestAssistantMessage,
  lastRollbackSourceRunId = null,
  lastRollbackResult = null,
  messages,
  onArtifactsRollback,
  onInspectorTabChange,
  onPlanOperatingPrompt,
  onPrefillComposer,
  onResizeStart,
  onTogglePanel,
  panelOpen,
  onRollbackSelectedRun,
  onToggleContextExclude,
  onToggleContextPin,
  pendingAction,
  selectedRunDetail = null,
  selectedRunRollbackBusy = false,
  selectedRunRollbackError = null,
  statusLabel,
  threadId,
  tokenUsage,
  traceSteps,
  turnAudit = null,
  workbenchMode,
}: DashboardRightPanelProps) {
  // When there's no pending action, fall back to last executed action so
  // the LinkedObjectsPanel continues to show the created item after confirmation.
  const displayAction = action ?? lastExecutedAction;

  const [inspectorSearch, setInspectorSearch] = useState("");
  const [inspectorSearchOpen, setInspectorSearchOpen] = useState(false);
  const [inspectorSearchResults, setInspectorSearchResults] = useState<
    Array<{ collection: string; id: number; title: string; href?: string }>
  >([]);
  const [inspectorSearching, setInspectorSearching] = useState(false);
  const inspectorSearchDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInspectorSearch = useCallback((query: string) => {
    setInspectorSearch(query);
    if (inspectorSearchDebounce.current) clearTimeout(inspectorSearchDebounce.current);
    if (!query.trim()) {
      setInspectorSearchResults([]);
      return;
    }
    inspectorSearchDebounce.current = setTimeout(async () => {
      setInspectorSearching(true);
      try {
        const res = await fetch(`/api/command/search?q=${encodeURIComponent(query.trim())}&limit=10`);
        if (res.ok) {
          const data = (await res.json()) as { results: typeof inspectorSearchResults };
          setInspectorSearchResults(data.results ?? []);
        }
      } catch {
        // silent
      } finally {
        setInspectorSearching(false);
      }
    }, 300);
  }, []);

  return (
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
            <h2>{getInspectorTabLabel(activeInspectorTab)}</h2>
          </div>
          <div className="sunny-dashboard-right-panel-actions">
            <AppIconButton
              aria-label={panelOpen ? "收起检查器" : "展开检查器"}
              className="sunny-dashboard-right-panel-toggle"
              icon={<InspectorPanelIcon open={panelOpen} />}
              onClick={onTogglePanel}
              size="sm"
              tooltip={panelOpen ? "收起检查器" : "展开检查器"}
            />
          </div>
        </div>
        <InspectorSearchToolbar
          onQueryChange={handleInspectorSearch}
          onSearchOpenChange={setInspectorSearchOpen}
          query={inspectorSearch}
          results={inspectorSearchResults}
          searchOpen={inspectorSearchOpen}
          searching={inspectorSearching}
        >
          <ContextInspector
            activeTab={activeInspectorTab}
            bare
            debugMode={debugMode}
            onTabChange={onInspectorTabChange}
            pendingAction={pendingAction}
          />
        </InspectorSearchToolbar>
        <div className="sunny-dashboard-right-panel-body">
          {activeInspectorTab === "context" ? (
            <AgentContextPanel
              pendingAction={pendingAction}
              statusLabel={statusLabel}
              traceSteps={traceSteps}
              workbenchMode={workbenchMode}
            />
          ) : null}
          {activeInspectorTab === "approval" ? <AgentApprovalPanel action={action} pendingAction={pendingAction} /> : null}
          {activeInspectorTab === "trace" ? (
            <AgentTracePanel
              action={action}
              activitySteps={latestAssistantMessage?.activitySteps ?? []}
              artifactsRollbackBusy={artifactsRollbackBusy}
              artifactsRollbackError={artifactsRollbackError}
              latestAssistantMessage={latestAssistantMessage}
              lastRollbackSourceRunId={lastRollbackSourceRunId}
              lastRollbackResult={lastRollbackResult}
              onArtifactsRollback={onArtifactsRollback}
              onPlanOperatingPrompt={onPlanOperatingPrompt}
              onRollbackSelectedRun={onRollbackSelectedRun}
              selectedRunDetail={selectedRunDetail}
              selectedRunRollbackBusy={selectedRunRollbackBusy}
              selectedRunRollbackError={selectedRunRollbackError}
              debugMode={debugMode}
              statusLabel={statusLabel}
              traceSteps={traceSteps}
            />
          ) : null}
          {activeInspectorTab === "linked" ? <LinkedObjectsPanel action={displayAction} debugMode={debugMode} selectedRunDetail={selectedRunDetail} /> : null}
          {activeInspectorTab === "memory" ? <MemoryInspectorPanel debugMode={debugMode} traceSteps={traceSteps} /> : null}
          {activeInspectorTab === "ops" ? <AgentOpsPanel /> : null}
          {activeInspectorTab === "inbox" ? <AgentInboxPanel onPrefillComposer={onPrefillComposer} /> : null}
          {activeInspectorTab === "plans" ? <PersistedPlanListPanel /> : null}
          {activeInspectorTab === "debug" ? (
            <AgentDebugPanel
              contextPreferences={contextPreferences}
              inputTokenEstimate={inputTokenEstimate}
              messages={messages}
              onToggleExclude={onToggleContextExclude}
              onTogglePin={onToggleContextPin}
              pendingAction={pendingAction}
              statusLabel={`${statusLabel} · ${modeLabelMap[workbenchMode]} · 上下文约 ${tokenUsage.contextTokens} tokens · 输入约 ${inputTokenEstimate} tokens`}
              threadId={threadId}
              tokenUsage={tokenUsage}
              traceSteps={traceSteps}
              turnAudit={turnAudit}
              workbenchMode={workbenchMode}
            />
          ) : null}
        </div>
      </aside>
  );
}
