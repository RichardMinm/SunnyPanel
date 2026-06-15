import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  compactAssistantMessageForPendingAction,
  parseScheduleResultMessage,
} from "../../src/components/dashboard/agent/utils";
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

    for (const label of ["主操作", "新对话", "搜索", "命令中心", "项目", "SunnyPanel", "工作区", "会话"]) {
      assert.match(sidebar, new RegExp(label));
    }

    assert.doesNotMatch(sidebar, /aria-label="插件"/);
    assert.doesNotMatch(sidebar, /aria-label="自动化"/);
    assert.match(sidebar, /formatThreadMeta/);
    assert.match(sidebar, /getPendingActionLabel\(thread\.pendingAction\)/);
    assert.match(sidebar, /filterDashboardThreads/);
    assert.match(sidebar, /filteredThreads\.slice/);
    assert.match(sidebar, /visibleThreads\.map/);
    assert.match(sidebar, /is-active/);
  });

  test("Archived and thread sidebar controls share one collapse button contract", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(sidebar, /sunny-codex-thread-section\$\{threadsOpen \? "" : " is-collapsed"\}/);
    assert.match(sidebar, /sunny-codex-archive-section\$\{archiveOpen \? "" : " is-collapsed"\}/);
    assert.match(shellCss, /\.sunny-codex-thread-section,\s*\.sunny-codex-archive-section/);
    assert.match(shellCss, /\.sunny-codex-thread-section\.is-collapsed,\s*\.sunny-codex-archive-section\.is-collapsed/);
    assert.doesNotMatch(agentCss, /\.sunny-codex-archive-section\s*\{/);
    assert.doesNotMatch(agentCss, /\.sunny-codex-archive-section\[aria-expanded="false"\]/);
  });

  test("Sidebar is icon-first and does not own the right Inspector toggle", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const sidebarNavCall = shell.match(/<SidebarNav[\s\S]*?\/>/)?.[0] ?? "";

    assert.match(sidebar, /DashboardIcon/);
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

  test("Dashboard keeps the six-tab Inspector as a default-hidden detail drawer", () => {
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
    assert.match(types, /AgentInspectorTab = "approval" \| "context" \| "linked" \| "memory" \| "trace" \| "inbox"/);
    for (const label of ["上下文", "审批", "Trace", "关联", "记忆", "建议"]) {
      assert.match(constants, new RegExp(label));
    }
    assert.doesNotMatch(constants, /label:\s*"确认"/);
    assert.doesNotMatch(constants, /label:\s*"记录"/);
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
    assert.match(inboxPanel, /onPrefillComposer\?\.\(item\.suggestedPrompt\)/);
    assert.match(inboxPanel, /采纳/);
    assert.match(inboxPanel, /忽略/);

    // dismiss 复用后端既有 7 天冷却（PATCH dismiss），无需额外客户端冷却逻辑。
    assert.match(inboxHook, /\/api\/agent\/suggestions/);
    assert.match(inboxHook, /"accept" \| "dismiss"/);
    assert.match(inboxHook, /method: "PATCH"/);

    assert.match(pageClient, /onPrefillComposer=\{\(prompt\) => \{ chat\.setInput\(prompt\); \}\}/);
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
    const messageCard = read("src/components/dashboard/agent/MessageCard.tsx");
    const dashboardHook = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");
    const agentCss = read("src/app/styles/sunny-agent.css");

    assert.match(conversation, /<AgentApprovalCard/);
    assert.match(conversation, /compactAssistantMessageForPendingAction/);
    assert.match(messageCard, /ScheduleResultCard/);
    assert.match(messageCard, /role === "user" \?/);
    assert.doesNotMatch(dashboardHook, /setStatusText\(`已恢复 Thread #\$\{selectedThread\.id\}`\)/);
    assert.match(dashboardHook, /setStatusText\("已就绪"\)/);
    assert.match(conversation, /sunny-agent-thread-action-area/);
    assert.match(conversation, /hasPendingConfirmation/);
    assert.match(conversation, /sunny-agent-conversation-scroll[\s\S]*sunny-agent-thread-action-area/);
    assert.doesNotMatch(read("src/components/dashboard/agent/AgentWorkbench.tsx"), /<AgentApprovalCard/);
    assert.match(agentCss, /\.sunny-message-card[\s\S]*display:\s*grid/);
    assert.match(agentCss, /\.sunny-message-card-user[\s\S]*width:\s*fit-content/);
    assert.match(agentCss, /\.sunny-agent-thread-header[\s\S]*width:\s*min\(100%, 860px\)/);
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
    assert.match(approvalCard, /冲突检测/);
    assert.match(approvalCard, /回滚状态/);
    assert.match(approvalCard, /写入数据库/);
    assert.match(approvalCard, /sunny-agent-risk-pill-v2/);
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
    assert.match(rightPanel, /暂无关联对象/);
    assert.match(rightPanel, /当本轮操作关联计划、日程、笔记或文章时/);
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

  test("parseScheduleResultMessage extracts schedule creation summary", () => {
    assert.deepEqual(parseScheduleResultMessage("已创建日程「专注推进一个计划动作」：2026-06-06 09:00-10:30。"), {
      title: "专注推进一个计划动作",
      date: "2026-06-06",
      timeRange: "09:00-10:30",
    });
    assert.equal(parseScheduleResultMessage("普通助手回复"), null);
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
