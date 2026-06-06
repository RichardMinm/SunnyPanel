import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

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

  for (const label of ["主操作", "新对话", "搜索", "命令中心", "项目", "SunnyPanel", "工作区", "会话"]) {
    assert.match(sidebar, new RegExp(label));
  }

  assert.doesNotMatch(sidebar, /aria-label="插件"/);
  assert.doesNotMatch(sidebar, /aria-label="自动化"/);
  assert.match(sidebar, /formatThreadMeta/);
  assert.match(sidebar, /getPendingActionLabel\(thread\.pendingAction\)/);
  assert.match(sidebar, /threads\.slice/);
  assert.match(sidebar, /visibleThreads\.map/);
  assert.match(sidebar, /is-active/);
});

test("Sidebar is icon-first and does not own the right Inspector toggle", () => {
  const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
  const shell = read("src/components/dashboard/DashboardShell.tsx");
  const sidebarNavCall = shell.match(/<SidebarNav[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(sidebar, /DashboardNavIcon/);
  assert.match(sidebar, /type DashboardIconName/);
  assert.match(sidebar, /icon:\s*"calendar"/);
  assert.match(sidebar, /icon:\s*"memory"/);
  assert.doesNotMatch(sidebar, /sunny-codex-sidebar-window-controls/);
  assert.doesNotMatch(sidebar, /sunny-codex-panel-toggle/);
  assert.doesNotMatch(sidebar, /panelOpen/);
  assert.doesNotMatch(sidebar, /onTogglePanel/);
  assert.doesNotMatch(sidebar, /📅|📋|🧠|⚙|⌘/);
  assert.doesNotMatch(sidebarNavCall, /onTogglePanel=/);
  assert.doesNotMatch(sidebarNavCall, /panelOpen=/);
});

test("Dashboard CSS uses Codex-like desktop geometry with floating inspector and composer", () => {
  const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
  const rightPanelCss = read("src/app/styles/sunny-dashboard-right-panel.css");
  const agentCss = read("src/app/styles/sunny-agent.css");

  assert.match(shellCss, /--dashboard-sidebar-width/);
  assert.match(shellCss, /--dashboard-icon-bar-width:\s*var\(--dashboard-sidebar-width\)/);
  assert.match(shellCss, /grid-template-columns:\s*var\(--dashboard-icon-bar-width\)/);
  assert.match(shellCss, /\.sunny-codex-sidebar/);
  assert.match(shellCss, /\.sunny-dashboard-right-panel/);
  assert.match(rightPanelCss, /\.sunny-dashboard-right-panel[\s\S]*grid-column:\s*3/);
  assert.match(rightPanelCss, /\.sunny-dashboard-right-panel[\s\S]*max-height:/);
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

test("Dashboard keeps the five-tab Inspector as a default-hidden detail drawer", () => {
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
  assert.match(rightPanel, /LinkedObjectsPanel/);
  assert.match(rightPanel, /MemoryInspectorPanel/);
  assert.doesNotMatch(rightPanel, /会话历史/);
  assert.match(types, /AgentInspectorTab = "approval" \| "context" \| "linked" \| "memory" \| "trace"/);
  for (const label of ["上下文", "审批", "Trace", "关联", "记忆"]) {
    assert.match(constants, new RegExp(label));
  }
  assert.doesNotMatch(constants, /label:\s*"确认"/);
  assert.doesNotMatch(constants, /label:\s*"记录"/);
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
  assert.match(composer, /MODE_OPTIONS/);
  assert.match(composer, /label:\s*"只回答"/);
  assert.match(composer, /modeMenuOpen/);
  assert.match(composer, /quickMenuOpen/);
  assert.match(composer, /aria-label="选择工作模式"/);
  assert.match(composer, /aria-label="打开快捷操作"/);
  assert.match(composer, /QUICK_ACTIONS/);
  assert.match(composer, /生成 DryRun/);
  assert.doesNotMatch(composer, /sunny-agent-composer-mode-copy/);
  assert.doesNotMatch(composer, /当前模式：/);
  assert.match(workbenchMode, /"answer"/);
  assert.match(chatRoute, /"answer"/);
});

test("Thread header is a single product status line while approval card owns write and risk detail", () => {
  const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");
  const threadHeader = read("src/components/dashboard/agent/ThreadHeader.tsx");
  const approvalCard = read("src/components/dashboard/agent/AgentApprovalCard.tsx");

  assert.match(conversation, /<AgentApprovalCard/);
  assert.doesNotMatch(read("src/components/dashboard/agent/AgentWorkbench.tsx"), /<AgentApprovalCard/);
  assert.match(threadHeader, /MODE_LABEL/);
  assert.match(threadHeader, /Thread #/);
  assert.match(threadHeader, /onOpenDetails/);
  assert.match(threadHeader, /debugMode/);
  assert.match(threadHeader, /onDebugModeChange/);
  assert.doesNotMatch(threadHeader, /formatTokenCount/);
  assert.doesNotMatch(threadHeader, /sunny-agent-thread-status-strip/);
  assert.doesNotMatch(threadHeader, /写入状态/);
  assert.doesNotMatch(threadHeader, /风险等级/);
  assert.match(approvalCard, /操作类型/);
  assert.match(approvalCard, /影响范围/);
  assert.match(approvalCard, /风险等级/);
  assert.match(approvalCard, /写入数据库/);
  assert.match(approvalCard, /查看详情/);
  assert.doesNotMatch(approvalCard, /记录 AgentRun/);
  assert.match(approvalCard, /请输入“确认执行”/);
  assert.match(approvalCard, /confirmPhrase/);
});

test("Dashboard syncs learning suggestions server-side without client inbox state", () => {
  const loadDashboardData = read("src/lib/dashboard/load-dashboard-data.ts");
  const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");
  const messagingHook = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");

  assert.match(loadDashboardData, /syncAgentSuggestionsFromWorkspaceSnapshot/);
  assert.doesNotMatch(pageClient, /suggestions/);
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
  const contextPanel = read("src/components/dashboard/agent/AgentContextPanel.tsx");
  const tracePanel = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  const agentCss = read("src/app/styles/sunny-agent.css");
  const rightCss = read("src/app/styles/sunny-dashboard-right-panel.css");

  assert.match(rightPanel, /function LinkedObjectsPanel/);
  assert.match(rightPanel, /关联计划/);
  assert.match(rightPanel, /关联日程/);
  assert.match(rightPanel, /暂无关联对象/);
  assert.match(rightPanel, /function MemoryInspectorPanel/);
  assert.match(rightPanel, /debugMode/);
  assert.match(rightPanel, /当前对话未使用长期记忆/);
  assert.match(rightPanel, /命中记忆：/);
  assert.match(contextPanel, /debugMode/);
  assert.match(contextPanel, /sunny-agent-debug-only/);
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

test("Right edge Inspector toggle is styled as the right panel affordance", () => {
  const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
  const rightCss = read("src/app/styles/sunny-dashboard-right-panel.css");

  assert.match(shellCss, /\.sunny-dashboard-inspector-toggle/);
  assert.match(shellCss, /right:\s*max\(0\.75rem, env\(safe-area-inset-right, 0px\)\)/);
  assert.match(shellCss, /\.sunny-dashboard-shell\.is-panel-expanded \.sunny-dashboard-inspector-toggle/);
  assert.match(rightCss, /\.sunny-dashboard-right-panel-toggle/);
  assert.match(rightCss, /\.sunny-dashboard-right-panel-actions/);
});
