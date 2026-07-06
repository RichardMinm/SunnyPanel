import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  compactAssistantMessageForPendingAction,
} from "../../src/components/dashboard/agent/utils";
import { formatIntentLabel } from "../../src/components/dashboard/agent/constants";
import { filterDashboardThreads } from "../../src/lib/dashboard/filter-dashboard-threads";
import type { AgentThreadSummary } from "../../src/components/dashboard/agent/types";
import type { PendingAction } from "../../src/lib/agent/schemas";

const read = (path: string) => readFileSync(path, "utf8");

const pendingConfirmation: PendingAction = {
  action: {
    args: {},
    changes: [],
    id: "action-1",
    intent: "compose_schedule_item",
    riskLevel: "medium",
    summary: "创建日程",
  },
  type: "await_confirmation",
};

const sampleThreads: AgentThreadSummary[] = [
  {
    id: 1,
    pendingAction: null,
    tags: ["学习"],
    title: "考研复习计划",
  },
  {
    id: 2,
    pendingAction: null,
    tags: ["开发", "前端"],
    title: "SunnyPanel 开发",
  },
  {
    id: 3,
    pendingAction: null,
    tags: ["复盘"],
    title: "本周复盘",
  },
  {
    id: 4,
    pendingAction: null,
    tags: [],
    title: "阅读笔记整理",
  },
];

describe("Dashboard layout contracts", () => {
  test("Dashboard shell wires data into a Codex-like sidebar instead of a top-tab driven canvas", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.match(shell, /<SidebarNav[\s\S]*threads=\{threads\}/);
    assert.match(shell, /<SidebarNav[\s\S]*threadId=\{threadId\}/);
    assert.match(shell, /<SidebarNav[\s\S]*onLoadThread=\{onLoadThread\}/);
    assert.match(shell, /<SidebarNav[\s\S]*onNewThread=\{handleNewThread\}/);
    assert.doesNotMatch(shell, /<MainWorkspace>[\s\S]*<TopTabs/);
  });

  test("Sidebar navigation exposes grouped actions, project, workspace, and thread metadata", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const sidebarHelpers = read("src/components/dashboard/sidebar/dashboard-sidebar-helpers.ts");
    const sidebarThreads = read("src/components/dashboard/sidebar/use-dashboard-sidebar-threads.ts");

    for (const label of ["主操作", "新对话", "搜索", "项目", "SunnyPanel", "工作区", "会话"]) {
      assert.match(sidebar, new RegExp(label));
    }

    assert.doesNotMatch(sidebar, /aria-label="命令中心"/);
    assert.doesNotMatch(sidebar, /打开命令中心/);
    assert.doesNotMatch(sidebar, /aria-label="插件"/);
    assert.doesNotMatch(sidebar, /aria-label="自动化"/);
    assert.match(sidebar, /formatThreadMeta/);
    assert.match(sidebarHelpers, /getPendingActionLabel\(thread\.pendingAction\)/);
    assert.match(sidebarThreads, /filterDashboardThreads/);
    assert.match(sidebarThreads, /filteredThreads\.slice/);
    assert.match(sidebar, /visibleThreads\.map/);
    assert.match(sidebar, /is-active/);
  });

  test("Sidebar auto-collapses to 56px icon strip with hover expand and pin lock", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const appShell = read("src/components/dashboard/AppShell.tsx");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

    // State
    assert.match(sidebar, /hoverExpanded/);
    assert.match(sidebar, /onHoverExpandedChange/);
    assert.match(sidebar, /pinned/);
    assert.match(sidebar, /onPinnedChange/);
    assert.match(shell, /sidebarPinned.*useState/);
    assert.match(shell, /sidebarHoverExpanded.*useState/);
    assert.match(shell, /sidebarExpanded/);
    assert.match(appShell, /is-sidebar-auto-collapsed/);
    assert.match(appShell, /is-sidebar-expanded/);
    assert.match(appShell, /is-sidebar-pinned/);
    assert.match(sidebar, /collapseTimer/);

    // Mouse handlers
    assert.match(sidebar, /onMouseEnter.*handleSidebarMouseEnter/);
    assert.match(sidebar, /onMouseLeave.*handleSidebarMouseLeave/);

    // Pin button
    assert.match(sidebar, /sunny-sidebar-pin-button/);
    assert.match(sidebar, /sunny-sidebar-pin-button is-square/);
    assert.match(sidebar, /sunny-dashboard-sidebar-brand-row/);
    assert.match(sidebar, /handleTogglePin/);
    const sidebarBottom = sidebar.match(/const sidebarBottom = \([\s\S]*?\n\s*\);/);
    assert.ok(sidebarBottom, "sidebar bottom region should be declared");
    assert.doesNotMatch(sidebarBottom[0], /sunny-sidebar-pin-button/);
    assert.match(sidebar, /sunny-dashboard-sidebar-settings-trigger/);

    // CSS variables
    assert.match(shellCss, /--dashboard-sidebar-collapsed-width:\s*56px/);
    assert.match(shellCss, /--dashboard-app-bg:\s*var\(--background\)/);
    assert.match(shellCss, /is-sidebar-auto-collapsed/);
    assert.match(shellCss, /is-sidebar-expanded/);
    assert.match(shellCss, /is-auto-collapsed/);
    assert.match(shellCss, /\.sunny-dashboard-sidebar-brand-row/);
    assert.match(shellCss, /\.sunny-sidebar-pin-button\.is-square/);
    assert.match(sidebar, /triggerAsChild/);
    assert.match(sidebar, /className="sunny-dashboard-sidebar-action sunny-dashboard-sidebar-settings-trigger"/);
    assert.match(shellCss, /\.sunny-dashboard-settings-popover/);
    assert.doesNotMatch(shellCss, /is-hover-expanded[\s\S]*position:\s*fixed/);

    // Push layout: grid column width animates with sidebar expand/collapse
    assert.match(
      shellCss,
      /\.sunny-dashboard-shell[\s\S]*transition:\s*grid-template-columns var\(--motion-duration-layout\)/,
    );
    assert.match(
      shellCss,
      /\.sunny-dashboard-shell\.is-sidebar-expanded[\s\S]*grid-template-columns:\s*var\(--dashboard-sidebar-width\)/,
    );
  });

  test("Sidebar settings are pinned in AppSidebar bottom slot", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");

    assert.match(
      sidebar,
      /const sidebarBottom = \([\s\S]*sunny-dashboard-icon-bar-bottom[\s\S]*DashboardSettingsMenu/,
    );
    assert.match(sidebar, /<AppSidebar[\s\S]*bottom=\{sidebarBottom\}/);
  });

  test("Sidebar tooltips only render for collapsed icon-only navigation", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const sidebarItem = read("src/components/layout/SidebarItem.tsx");

    assert.match(sidebarItem, /showTooltip\?: boolean/);
    assert.match(sidebarItem, /showTooltip = true/);
    assert.match(sidebarItem, /if \(tooltip\)/);
    assert.match(sidebarItem, /if \(!showTooltip\) return element/);
    assert.match(sidebar, /const showSidebarTooltips = stripCollapsed && !hoverExpanded/);
    assert.match(sidebar, /tooltip="新对话"[\s\S]*showTooltip=\{showSidebarTooltips\}/);
    assert.match(sidebar, /tooltip=\{mode\.label\}[\s\S]*showTooltip=\{showSidebarTooltips\}/);
    assert.match(sidebar, /tooltip="设置"[\s\S]*showTooltip=\{showSidebarTooltips\}/);
  });

  test("Sidebar visual polish keeps settings aligned and navigation hierarchy quiet", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");

    const bottomRule = css.match(/\.sunny-dashboard-icon-bar-bottom\s*\{[^}]*\}/s);
    assert.ok(bottomRule);
    assert.match(bottomRule[0], /align-items:\s*stretch/);

    const topRule = css.match(/\.sunny-dashboard-sidebar-top\s*\{[^}]*\}/s);
    assert.ok(topRule);
    assert.match(topRule[0], /gap:\s*0\.65rem/);

    const titleRule = css.match(/\.sunny-dashboard-sidebar-section p\s*\{[^}]*\}/s);
    assert.ok(titleRule);
    assert.match(titleRule[0], /font-weight:\s*500/);
    assert.match(titleRule[0], /letter-spacing:\s*0/);

    const iconRule = css.match(/\.sunny-dashboard-icon-bar \.app-sidebar-item__icon\s*\{[^}]*\}/s);
    assert.ok(iconRule);
    assert.match(iconRule[0], /width:\s*1\.1rem/);
    assert.match(iconRule[0], /color:\s*var\(--muted\)/);

    const searchRule = css.match(/\.sunny-dashboard-search-wrapper\.app-input\s*\{[^}]*\}/s);
    assert.ok(searchRule);
    assert.match(searchRule[0], /border-color:\s*color-mix\(in oklch, var\(--border\) 38%/);
    assert.match(searchRule[0], /background:\s*color-mix\(in oklch, var\(--muted\) 4%/);

    const collapseRule = css.match(/\.sunny-dashboard-sidebar-collapse-toggle\s*\{[^}]*\}/s);
    assert.ok(collapseRule);
    assert.match(collapseRule[0], /font-weight:\s*520/);
    assert.match(collapseRule[0], /padding:\s*0\.3rem 0\.5rem/);
  });

  test("Session sidebar is limited to workbench mode", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.match(sidebar, /const isWritingMode = activeMode === "writing"/);
    assert.match(sidebar, /const showSessionSidebar = activeMode === "agent"/);
    assert.match(sidebar, /showSessionSidebar \? \([\s\S]*sunny-dashboard-sidebar-search/);
    assert.match(sidebar, /showSessionSidebar \? \([\s\S]*aria-label="会话"/);
    assert.match(sidebar, /showSessionSidebar \? \([\s\S]*aria-label="已归档"/);
    assert.match(sidebar, /isWritingMode \? <WritingLibraryRail/);
    assert.match(shell, /threadListMode=\{activeMode === "agent" \? "full" : "hidden"\}/);
  });

  test("Archived and thread sidebar controls share one collapse button contract", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(sidebar, /sunny-dashboard-thread-section\$\{threadsOpen \? "" : " is-collapsed"\}/);
    assert.match(sidebar, /sunny-dashboard-archive-section\$\{archiveOpen \? "" : " is-collapsed"\}/);
    assert.match(shellCss, /\.sunny-dashboard-thread-section,\s*\.sunny-dashboard-archive-section/);
    assert.match(shellCss, /\.sunny-dashboard-thread-section\.is-collapsed,\s*\.sunny-dashboard-archive-section\.is-collapsed/);
    assert.doesNotMatch(agentCss, /\.sunny-dashboard-archive-section\s*\{/);
    assert.doesNotMatch(agentCss, /\.sunny-dashboard-archive-section\[aria-expanded="false"\]/);
  });

  test("Sidebar is icon-first and does not own the right Inspector toggle", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const sidebarItem = read("src/components/layout/SidebarItem.tsx");
    const sidebarModes = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    const icons = read("src/components/dashboard/icons.tsx");
    const sidebarNavCall = shell.match(/<SidebarNav[\s\S]*?\/>/)?.[0] ?? "";

    assert.match(sidebar, /DashboardIcon/);
    assert.match(icons, /export type DashboardIconName/);
    assert.match(sidebarModes, /icon:\s*"calendar"/);
    assert.match(sidebarModes, /icon:\s*"memory"/);
    assert.match(sidebarItem, /app-sidebar-item__icon[\s\S]*app-sidebar-item__label/);
    assert.doesNotMatch(sidebar, /sunny-codex-sidebar-window-controls/);
    assert.doesNotMatch(sidebar, /sunny-codex-panel-toggle/);
    assert.doesNotMatch(sidebar, /onTogglePanel/);
    assert.doesNotMatch(sidebar, /📅|📋|🧠|⚙|⌘/);
    assert.doesNotMatch(sidebarNavCall, /onTogglePanel=/);
    assert.match(shell, /panelOpen=\{activeMode !== "writing" && panelOpen\}/);
  });

  test("Dashboard CSS uses Codex-like desktop geometry with floating inspector and composer", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const rightPanelCss = read("src/app/styles/sunny-dashboard-right-panel.css");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(shellCss, /--dashboard-sidebar-width/);
    assert.match(shellCss, /--dashboard-icon-bar-width:\s*var\(--dashboard-sidebar-width\)/);
    assert.match(shellCss, /grid-template-columns:\s*var\(--dashboard-icon-bar-width\)/);
    assert.match(shellCss, /\.sunny-dashboard-sidebar/);
    assert.match(shellCss, /\.sunny-dashboard-right-panel/);
    assert.match(rightPanelCss, /\.sunny-dashboard-right-panel[\s\S]*position:\s*fixed/);
    assert.match(rightPanelCss, /\.sunny-dashboard-right-panel[\s\S]*max-height:/);
    assert.match(shellCss, /\.sunny-dashboard-shell\.is-panel-expanded \.sunny-dashboard-main[\s\S]*padding-right:\s*var\(--dashboard-panel-width\)/);
    assert.match(agentCss, /\.sunny-agent-center-surface[\s\S]*box-shadow:\s*none/);
    assert.match(agentCss, /\.sunny-agent-composer[\s\S]*position:\s*sticky/);
    assert.match(agentCss, /\.sunny-message-card-body[\s\S]*border:\s*none/);
  });

  test("Thinking state is rendered inside the conversation task flow instead of as a standalone workbench frame", () => {
    const workbench = read("src/components/dashboard/agent/AgentWorkbench.tsx");
    const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");
    const threadHeader = read("src/components/dashboard/agent/ThreadHeader.tsx");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.doesNotMatch(workbench, /import \{ AgentThinkingPanel \}/);
    assert.doesNotMatch(workbench, /<AgentThinkingPanel/);
    assert.match(conversation, /import \{ AgentThinkingPanel \}/);
    assert.match(conversation, /useEffect/);
    assert.match(conversation, /transcript\.scrollTo/);
    assert.match(conversation, /<AgentThinkingPanel[\s\S]*isThinking=\{isThinking\}/);
    assert.match(threadHeader, /getSummaryStatus/);
    assert.match(threadHeader, /Thread #/);
    assert.doesNotMatch(threadHeader, /sunny-agent-thread-header-badges/);
    assert.match(agentCss, /\.sunny-agent-thinking-panel[\s\S]*border:\s*none/);
    assert.match(agentCss, /\.sunny-agent-thinking-panel[\s\S]*background:\s*transparent/);
  });

  test("Conversation task flow is driven by structured stream stages instead of thinking text only", () => {
    const dashboardHook = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");
    const messagingHook = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");
    const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");
    const thinkingPanel = read("src/components/dashboard/agent/AgentThinkingPanel.tsx");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(dashboardHook, /streamStages/);
    assert.match(dashboardHook, /streamProgress/);
    assert.match(dashboardHook, /streamChanges/);
    assert.match(messagingHook, /onStage:/);
    assert.match(messagingHook, /onProgress:/);
    assert.match(messagingHook, /onChange:/);
    assert.match(conversation, /streamStages=\{streamStages\}/);
    assert.match(conversation, /streamProgress=\{streamProgress\}/);
    assert.match(conversation, /streamChanges=\{streamChanges\}/);
    assert.match(thinkingPanel, /AgentStreamStageEvent/);
    assert.match(thinkingPanel, /streamStages/);
    assert.match(thinkingPanel, /sunny-agent-stage-row/);
    assert.match(agentCss, /\.sunny-agent-stage-row/);
  });

  test("Dashboard keeps the ops-enabled Inspector as a default-hidden detail drawer", () => {
    const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
    const constants = read("src/components/dashboard/agent/constants.ts");
    const types = read("src/components/dashboard/agent/types.ts");

    assert.match(pageClient, /messages=\{chat\.messages\}/);
    assert.match(pageClient, /workbenchMode=\{chat\.workbenchMode\}/);
    assert.match(shell, /messages:\s*AgentChatMessage\[\]/);
    assert.match(shell, /messages=\{messages\}/);
    assert.match(shell, /useState\(false\)/);
    assert.match(shell, /const openInspector/);
    assert.match(shell, /debugMode/);
    assert.match(shell, /setDebugMode/);
    assert.match(shell, /<DashboardRightPanel/);
    assert.match(shell, /debugMode=\{debugMode\}/);
    assert.doesNotMatch(shell, /<RightContextPanel/);
    assert.doesNotMatch(shell, /setPanelOpen\(!mediaQuery\.matches\)/);
    assert.match(rightPanel, /aria-label="右侧检查器"/);
    assert.match(rightPanel, /panelOpen/);
    assert.match(rightPanel, /onTogglePanel/);
    assert.match(rightPanel, /debugMode/);
    assert.match(rightPanel, /aria-label=\{panelOpen \? "收起检查器" : "展开检查器"\}/);
    assert.match(rightPanel, /activeInspectorTab/);
    assert.match(rightPanel, /AgentContextPanel/);
    assert.match(rightPanel, /AgentApprovalPanel/);
    assert.match(rightPanel, /AgentTracePanel/);
    assert.match(rightPanel, /AgentOpsPanel/);
    assert.match(rightPanel, /LinkedObjectsPanel/);
    assert.match(rightPanel, /MemoryInspectorPanel/);
    assert.doesNotMatch(rightPanel, /会话历史/);
    assert.match(types, /AgentInspectorTab = "approval" \| "context" \| "debug" \| "linked" \| "memory" \| "trace" \| "inbox" \| "ops"/);
    for (const label of ["上下文", "进度", "详细", "关联", "记忆", "Ops", "建议", "调试"]) {
      assert.match(constants, new RegExp(label));
    }
    assert.doesNotMatch(constants, /label:\s*"确认"/);
    assert.doesNotMatch(constants, /label:\s*"记录"/);
  });

  test("Right Inspector search is an icon toggle with styled expandable field", () => {
    const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
    const searchToolbar = read("src/components/dashboard/agent/InspectorSearchToolbar.tsx");
    const contextInspector = read("src/components/dashboard/agent/ContextInspector.tsx");
    const rightCss = read("src/app/styles/sunny-dashboard-right-panel.css");

    assert.match(rightPanel, /InspectorSearchToolbar/);
    assert.match(rightPanel, /inspectorSearchOpen/);
    assert.match(rightPanel, /setInspectorSearchOpen/);
    assert.doesNotMatch(rightPanel, /sunny-agent-inspector-search/);
    assert.match(searchToolbar, /DashboardIcon name="search"/);
    assert.match(searchToolbar, /aria-expanded=\{searchOpen\}/);
    assert.match(searchToolbar, /sunny-dashboard-inspector-search/);
    assert.match(searchToolbar, /sunny-dashboard-search-wrapper/);
    assert.match(searchToolbar, /Escape/);
    assert.match(rightPanel, /ContextInspector/);
    assert.match(contextInspector, /bare\?: boolean/);
    assert.match(rightCss, /\.sunny-dashboard-inspector-toolbar/);
    assert.match(
      rightCss,
      /\.sunny-dashboard-inspector-search[\s\S]*transition:[\s\S]*max-height var\(--motion-duration-layout\)/,
    );
  });

  test("Agent Inbox tab surfaces suggestions and accept prefills the composer through a safe gate", () => {
    const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
    const inboxPanel = read("src/components/dashboard/agent/AgentInboxPanel.tsx");
    const inboxHook = read("src/components/dashboard/agent/use-agent-inbox.ts");
    const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");

    // Inbox 作为检查器新 Tab 接入，accept 预填 composer（复核后再经安全门）。
    assert.match(rightPanel, /AgentInboxPanel/);
    assert.match(rightPanel, /activeInspectorTab === "inbox"/);
    assert.match(rightPanel, /onPrefillComposer=\{onPrefillComposer\}/);

    assert.match(inboxPanel, /useAgentInbox/);
    assert.match(inboxPanel, /onPrefillComposer\?\.\(item\.suggestedPrompt,\s*\{[\s\S]*suggestionId:\s*item\.id/);
    assert.match(inboxPanel, /采纳/);
    assert.match(inboxPanel, /忽略/);

    // dismiss 复用后端既有 7 天冷却（PATCH dismiss），无需额外客户端冷却逻辑。
    assert.match(inboxHook, /\/api\/agent\/suggestions/);
    assert.match(inboxHook, /"accept" \| "dismiss"/);
    assert.match(inboxHook, /method: "PATCH"/);

    assert.match(pageClient, /onPrefillComposer=\{\(prompt,\s*source\) => \{ chat\.prefillFromSuggestion\(prompt,\s*source\); \}\}/);
    assert.match(read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts"), /suggestionId/);
    assert.match(read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts"), /suggestedPrompt/);
  });

  test("Approval inspector has a dedicated strategy resume card", () => {
    const approvalPanel = read("src/components/dashboard/agent/AgentApprovalPanel.tsx");

    assert.match(approvalPanel, /pendingAction\?\.type === "await_strategy_resume"/);
    assert.match(approvalPanel, /策略恢复/);
    assert.match(approvalPanel, /pendingAction\.failureReason/);
    assert.match(approvalPanel, /pendingAction\.strategyMode/);
    assert.match(approvalPanel, /pendingAction\.failedTaskId/);
    assert.match(approvalPanel, /回复「继续」/);
    assert.match(approvalPanel, /回复「取消」/);
    assert.match(approvalPanel, /formatIntentLabel\(task\.intent\)/);
    assert.match(approvalPanel, /formatAgentRoleLabel\(task\.agentRole\)/);
  });

  test("Trace inspector renders a dedicated Plan Operating Card for readiness audits", () => {
    const tracePanel = read("src/components/dashboard/agent/AgentTracePanel.tsx");
    const operatingCard = read("src/components/dashboard/agent/PlanOperatingCard.tsx");

    assert.match(tracePanel, /PlanOperatingCard/);
    assert.match(tracePanel, /run\.workflow === "readiness-audit"/);
    assert.match(operatingCard, /Plan Operating/);
    assert.match(operatingCard, /readiness-audit/);
    assert.match(operatingCard, /下一步/);
    assert.match(operatingCard, /状态/);
    assert.match(operatingCard, /复核/);
    assert.match(operatingCard, /继续推进/);
    assert.match(operatingCard, /暂缓这项计划/);
    assert.match(operatingCard, /进入审阅/);
    assert.match(operatingCard, /onRunPrompt/);
    assert.match(read("src/components/dashboard/DashboardShell.tsx"), /onPlanOperatingPrompt=\{onRunPrompt\}/);
    assert.match(read("src/components/dashboard/DashboardRightPanel.tsx"), /onPlanOperatingPrompt/);
  });

  test("Inspector labels cover new Agent intents without exposing raw internal names", () => {
    const expectedLabels = {
      capability_query: "能力查询",
      delete_record: "删除记录",
      modify_record: "修改记录",
      query_checklist_progress: "查询清单进度",
      query_memory: "查询记忆",
      query_plan: "查询计划",
      query_schedule: "查询日程",
      query_timeline: "查询时间线",
    };

    for (const [intent, label] of Object.entries(expectedLabels)) {
      assert.equal(formatIntentLabel(intent), label);
      assert.notEqual(formatIntentLabel(intent), intent);
    }
  });

  test("Composer is mode-aware through a compact menu and sends workbenchMode to the Agent chat API", () => {
    const dashboardHook = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");
    const messagingHook = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");
    const workbench = read("src/components/dashboard/agent/AgentWorkbench.tsx");
    const composer = read("src/components/dashboard/agent/AgentComposer.tsx");
    const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");
    const workbenchMode = read("src/lib/agent/workbench-mode.ts");
    const chatRoute = read("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");

    assert.match(dashboardHook, /workbenchMode/);
    assert.match(dashboardHook, /setWorkbenchMode/);
    assert.match(messagingHook, /workbenchMode/);
    assert.match(messagingHook, /workbenchMode,\s*stream: true/);
    assert.match(workbench, /workbenchMode=\{workbenchMode\}/);
    assert.match(workbench, /onWorkbenchModeChange=\{onWorkbenchModeChange\}/);
    assert.match(pageClient, /onWorkbenchModeChange=\{chat\.setWorkbenchMode\}/);
    assert.match(composer, /ComposerModeSelect/);
    assert.match(composer, /ComposerAddMenu/);
    assert.match(composer, /modeMenuOpen/);
    assert.match(composer, /quickMenuOpen/);
    assert.match(composer, /triggerAriaLabel="选择工作模式"/);
    assert.match(composer, /triggerAriaLabel="添加上下文 \/ 文件 \/ 命令"/);
    assert.match(read("src/components/dashboard/agent/ComposerModeSelect.tsx"), /label:\s*"只回答"/);
    assert.match(composer, /打开当前上下文/);
    assert.match(composer, /sunny-agent-composer-actions/);
    assert.match(read("src/components/dashboard/agent/ComposerAddMenu.tsx"), /调试模式/);
    assert.match(read("src/components/dashboard/agent/ComposerModeSelect.tsx"), /Sunny 会自动判断如何处理/);
    assert.match(composer, /title=\{sendTitle\}/);
    assert.match(composer, /生成 DryRun/);
    assert.doesNotMatch(composer, /sunny-agent-composer-mode-copy/);
    assert.doesNotMatch(composer, /当前模式：/);
    assert.match(workbenchMode, /"answer"/);
    assert.match(chatRoute, /"answer"/);
    assert.match(composer, /useDashboardInspectorControl/);
    assert.match(composer, /panelOpen/);
    assert.match(composer, /togglePanel/);
    assert.match(read("src/components/dashboard/DashboardInspectorControlContext.tsx"), /togglePanel/);
    assert.match(read("src/components/dashboard/DashboardShell.tsx"), /togglePanel: handleTogglePanel/);
  });

  test("Agent chat requests include a client-generated turnId", () => {
    const messagingHook = read(
      "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts",
    );

    assert.match(
      messagingHook,
      /const turnId = globalThis\.crypto\.randomUUID\(\)/,
    );
    assert.match(messagingHook, /threadId,\s*turnId,/);
  });

  test("Thread header is a single product status line while approval card owns write and risk detail", () => {
    const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");
    const threadHeader = read("src/components/dashboard/agent/ThreadHeader.tsx");
    const approvalCard = read("src/components/dashboard/agent/AgentApprovalCard.tsx");
    const messageCard = read("src/components/dashboard/agent/MessageCard.tsx");
    const dashboardHook = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(conversation, /<AgentApprovalCard/);
    assert.match(conversation, /compactAssistantMessageForPendingAction/);
    assert.match(messageCard, /role === "user" \?/);
    assert.doesNotMatch(dashboardHook, /setStatusText\(`已恢复 Thread #\$\{selectedThread\.id\}`\)/);
    assert.match(dashboardHook, /setStatusText\("已就绪"\)/);
    assert.match(conversation, /sunny-agent-thread-action-area/);
    assert.match(conversation, /hasPendingConfirmation/);
    assert.match(conversation, /sunny-agent-conversation-scroll[\s\S]*sunny-agent-thread-action-area/);
    assert.doesNotMatch(read("src/components/dashboard/agent/AgentWorkbench.tsx"), /<AgentApprovalCard/);
    assert.match(agentCss, /\.sunny-message-card[\s\S]*display:\s*grid/);
    assert.match(agentCss, /\.sunny-message-card-user[\s\S]*width:\s*fit-content/);
    assert.match(agentCss, /\.sunny-message-card-user \.sunny-message-card-body[\s\S]*--agent-bubble-user-bg/);
    assert.match(agentCss, /\.sunny-agent-thread-header[\s\S]*width:\s*min\(100%, 860px\)/);
    assert.match(threadHeader, /MODE_LABEL/);
    assert.match(threadHeader, /Thread #/);
    assert.match(threadHeader, /debugMode/);
    assert.doesNotMatch(threadHeader, /onOpenDetails/);
    assert.doesNotMatch(threadHeader, /onDebugModeChange/);
    assert.doesNotMatch(threadHeader, /aria-label="调试"/);
    assert.doesNotMatch(threadHeader, /formatTokenCount/);
    assert.doesNotMatch(threadHeader, /sunny-agent-thread-status-strip/);
    assert.doesNotMatch(threadHeader, /写入状态/);
    assert.doesNotMatch(threadHeader, /风险等级/);
    assert.match(approvalCard, /操作类型/);
    assert.match(approvalCard, /影响范围/);
    assert.match(approvalCard, /冲突检测/);
    assert.match(approvalCard, /回滚状态/);
    assert.match(approvalCard, /写入数据库/);
    assert.match(approvalCard, /sunny-agent-risk-pill-v2/);
    assert.match(approvalCard, /查看详情/);
    assert.doesNotMatch(approvalCard, /记录 AgentRun/);
    assert.match(approvalCard, /请输入“确认执行”/);
    assert.match(approvalCard, /confirmPhrase/);
    assert.match(approvalCard, /AppButton/);
    assert.match(read("src/components/dashboard/agent/ThreadHeader.tsx"), /AppIconButton/);
    assert.match(read("src/components/dashboard/agent/AgentComposer.tsx"), /AppIconButton/);
  });

  test("Dashboard syncs learning suggestions through the server endpoint without client inbox state", () => {
    const loadDashboardData = read("src/lib/dashboard/load-dashboard-data.ts");
    const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");
    const messagingHook = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");
    const syncRoute = read("src/app/api/agent/suggestions/sync/route.ts");

    assert.doesNotMatch(loadDashboardData, /syncAgentSuggestionsFromWorkspaceSnapshot/);
    assert.match(pageClient, /\/api\/agent\/suggestions\/sync/);
    assert.match(pageClient, /method: "POST"/);
    assert.match(pageClient, /syncInFlightRef/);
    assert.match(syncRoute, /syncAgentSuggestionsFromWorkspaceSnapshot/);
    assert.match(syncRoute, /getCachedWorkspaceSnapshot/);
    assert.doesNotMatch(pageClient, /initialSuggestions/);
    assert.doesNotMatch(pageClient, /AgentInboxSuggestion/);
    assert.doesNotMatch(pageClient, /getPendingAgentSuggestions/);
    assert.doesNotMatch(pageClient, /setInboxSuggestions/);
    assert.doesNotMatch(messagingHook, /refreshInboxSuggestions/);
    assert.doesNotMatch(messagingHook, /setInboxSuggestions/);
  });

  test("Right Inspector no longer defaults to suggestions or full conversation history", () => {
    const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.doesNotMatch(rightPanel, /PendingActionsCard/);
    assert.doesNotMatch(rightPanel, /HistoryCard/);
    assert.doesNotMatch(rightPanel, /quickPrompts/);
    assert.doesNotMatch(rightPanel, /suggestions/);
    assert.doesNotMatch(rightPanel, /会话历史/);
    assert.doesNotMatch(shell, /onDismissSuggestion/);
    assert.doesNotMatch(shell, /onRunSuggestion/);
  });

  test("Debug-only Inspector copy is gated behind debugMode", () => {
    const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
    const debugPanel = read("src/components/dashboard/agent/AgentDebugPanel.tsx");
    const tracePanel = read("src/components/dashboard/agent/AgentTracePanel.tsx");
    const agentCss = read("src/app/styles/sunny-agent.css");
    const rightCss = read("src/app/styles/sunny-dashboard-right-panel.css");

    assert.match(rightPanel, /function LinkedObjectsPanel/);
    assert.match(rightPanel, /暂无关联对象/);
    assert.match(rightPanel, /当本轮操作关联计划、日程、笔记或文章时/);
    assert.match(rightPanel, /function MemoryInspectorPanel/);
    assert.match(rightPanel, /debugMode/);
    assert.match(rightPanel, /AgentDebugPanel/);
    assert.match(rightPanel, /activeInspectorTab === "debug"/);
    assert.match(rightPanel, /当前对话未使用长期记忆/);
    assert.match(rightPanel, /命中记忆：/);
    assert.match(debugPanel, /sunny-agent-debug-only/);
    assert.match(debugPanel, /Thread ID/);
    assert.match(tracePanel, /debugMode/);
    assert.match(tracePanel, /showDebugTrace/);
    assert.doesNotMatch(agentCss, /\.sunny-agent-thread-status-strip/);
    assert.match(rightCss, /\.sunny-dashboard-right-panel/);
  });

  test("Ordinary chat turns do not auto-open Trace and status bar omits token counts by default", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const messagingHook = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");
    const statusBar = read("src/components/dashboard/DashboardStatusBar.tsx");

    assert.match(shell, /isSubmitting/);
    assert.match(shell, /workbenchMode === "execute"/);
    assert.doesNotMatch(
      messagingHook,
      /else if \(assistantMessage\) \{\s*setActiveInspectorTab\("trace"\);\s*\}/,
    );
    assert.doesNotMatch(shell, /tokenCount=\{tokenCount\}/);
    assert.doesNotMatch(statusBar, /上下文 \{tokenCount\}/);
  });

  test("Starting a new thread clears stale title and execution detail state", () => {
    const dashboardHook = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");
    const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");

    assert.match(dashboardHook, /resetThread:\s*resetConversationThread/);
    assert.match(dashboardHook, /const resetThread = useCallback/);
    assert.match(dashboardHook, /resetConversationThread\(\)/);
    assert.match(dashboardHook, /clearRunDetail\(\)/);
    assert.match(dashboardHook, /setThreadTitle\(""\)/);
    assert.match(dashboardHook, /setThreadHydrated\(true\)/);
    assert.match(pageClient, /onNewThread=\{\(\) => \{ chat\.clearRunDetail\(\); chat\.resetThread\(\); \}\}/);
  });

  test("Thread URL sync preserves existing Dashboard workspace search params", () => {
    const sync = read("src/components/dashboard/agent-chat/use-dashboard-url-thread-sync.ts");

    assert.match(sync, /new URLSearchParams\(searchParams\.toString\(\)\)/);
    assert.match(sync, /params\.set\("threadId", String\(threadId\)\)/);
    assert.match(sync, /params\.delete\("threadId"\)/);
    assert.doesNotMatch(sync, /buildDashboardHref/);
  });

  test("Right edge Inspector toggle is styled as the right panel affordance", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const rightCss = read("src/app/styles/sunny-dashboard-right-panel.css");

    assert.match(shellCss, /\.sunny-dashboard-inspector-toggle/);
    assert.match(shellCss, /right:\s*max\(0\.75rem, env\(safe-area-inset-right, 0px\)\)/);
    assert.match(shellCss, /\.sunny-dashboard-shell\.is-panel-expanded \.sunny-dashboard-inspector-toggle/);
    assert.match(rightCss, /\.sunny-dashboard-right-panel-toggle/);
    assert.match(rightCss, /\.sunny-dashboard-right-panel-actions/);
  });
});

describe("Dashboard conversation utils", () => {
  test("compactAssistantMessageForPendingAction keeps leading context before dry-run boilerplate", () => {
    const content =
      "今天最该推进 CET-6 计划。\n\n我已经 dry-run 了这个工具动作。风险等级：中风险。\n\n将要做：创建日程";

    assert.equal(
      compactAssistantMessageForPendingAction(content, pendingConfirmation),
      "今天最该推进 CET-6 计划。\n\n我已整理好一个待确认操作，详情见下方卡片。",
    );
  });

  test("compactAssistantMessageForPendingAction replaces pure dry-run text with a short card hint", () => {
    const content =
      "我已经 dry-run 了这个工具动作。风险等级：中风险。\n\n将要做：创建日程\n\n回复「确认」或「执行」后我再真正写入；回复「取消」会放弃这次动作。";

    assert.equal(
      compactAssistantMessageForPendingAction(content, pendingConfirmation),
      "我已整理好一个待确认操作，详情见下方卡片。",
    );
  });

  test("compactAssistantMessageForPendingAction leaves unrelated messages unchanged", () => {
    const content = "这是普通回答，没有待确认操作。";

    assert.equal(compactAssistantMessageForPendingAction(content, pendingConfirmation), content);
    assert.equal(compactAssistantMessageForPendingAction(content, null), content);
  });

  test("compactAssistantMessageForPendingAction compacts historical dry-run when pending is null", () => {
    const content =
      "今天最该推进 CET-6 计划。\n\n我已经 dry-run 了这个工具动作。风险等级：中风险。\n\n将要做：创建日程";

    assert.equal(
      compactAssistantMessageForPendingAction(content, null),
      "今天最该推进 CET-6 计划。\n\n（DryRun 详情已归档为结构化记录，不再展开全文。）",
    );
  });
});

describe("Dashboard thread search", () => {
  test("empty search returns all threads", () => {
    assert.equal(filterDashboardThreads(sampleThreads, "").length, 4);
    assert.equal(filterDashboardThreads(sampleThreads, "  ").length, 4);
  });

  test("filters threads by title keyword", () => {
    const result = filterDashboardThreads(sampleThreads, "考研");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 1);
  });

  test("filters threads by tag", () => {
    const result = filterDashboardThreads(sampleThreads, "前端");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 2);
  });

  test("search is case-insensitive", () => {
    const result = filterDashboardThreads(sampleThreads, "SUNNYPANEL");
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 2);
  });

  test("returns empty array when nothing matches", () => {
    assert.equal(filterDashboardThreads(sampleThreads, "健身").length, 0);
  });
});
