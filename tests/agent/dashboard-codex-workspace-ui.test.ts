import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Dashboard shell wires data into a Codex-like sidebar instead of a top-tab driven canvas", () => {
  const shell = read("src/components/dashboard/DashboardShell.tsx");

  assert.match(shell, /<SidebarNav[\s\S]*threads=\{threads\}/);
  assert.match(shell, /<SidebarNav[\s\S]*threadId=\{threadId\}/);
  assert.match(shell, /<SidebarNav[\s\S]*onLoadThread=\{onLoadThread\}/);
  assert.match(shell, /<SidebarNav[\s\S]*onNewThread=\{onNewThread\}/);
  assert.doesNotMatch(shell, /<MainWorkspace>[\s\S]*<TopTabs/);
});

test("Sidebar navigation exposes Codex desktop sections for actions, project and recent threads", () => {
  const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");

  for (const label of ["新对话", "搜索", "插件", "自动化", "置顶", "项目", "SunnyPanel", "工作区"]) {
    assert.match(sidebar, new RegExp(label));
  }

  assert.match(sidebar, /threads\.slice/);
  assert.match(sidebar, /visibleThreads\.map/);
  assert.match(sidebar, /is-active/);
});

test("Dashboard CSS uses Codex-like desktop geometry with floating inspector and composer", () => {
  const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
  const agentCss = read("src/app/styles/sunny-agent.css");

  assert.match(shellCss, /--dashboard-sidebar-width/);
  assert.match(shellCss, /grid-template-columns:\s*var\(--dashboard-sidebar-width\)/);
  assert.match(shellCss, /\.sunny-codex-sidebar/);
  assert.match(shellCss, /\.sunny-dashboard-slide-panel[\s\S]*align-self:\s*start/);
  assert.match(shellCss, /\.sunny-dashboard-slide-panel[\s\S]*max-height:/);
  assert.match(agentCss, /\.sunny-agent-center-surface[\s\S]*box-shadow:\s*none/);
  assert.match(agentCss, /\.sunny-agent-composer[\s\S]*position:\s*sticky/);
  assert.match(agentCss, /\.sunny-message-card-body[\s\S]*border:\s*none/);
});

test("Thinking state is rendered inside the conversation task flow instead of as a standalone workbench frame", () => {
  const workbench = read("src/components/dashboard/agent/AgentWorkbench.tsx");
  const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");
  const agentCss = read("src/app/styles/sunny-agent.css");

  assert.doesNotMatch(workbench, /import \{ AgentThinkingPanel \}/);
  assert.doesNotMatch(workbench, /<AgentThinkingPanel/);
  assert.match(conversation, /import \{ AgentThinkingPanel \}/);
  assert.match(conversation, /useEffect/);
  assert.match(conversation, /transcript\.scrollTo/);
  assert.match(conversation, /<AgentThinkingPanel[\s\S]*isThinking=\{isThinking\}/);
  assert.match(conversation, /<span>\{isSubmitting \? "运行中" : "已就绪"\}<\/span>/);
  assert.match(agentCss, /\.sunny-agent-thinking-panel[\s\S]*border:\s*none/);
  assert.match(agentCss, /\.sunny-agent-thinking-panel[\s\S]*background:\s*transparent/);
});

test("Right context panel summarizes the current conversation instead of repeating the running status", () => {
  const pageClient = read("src/components/dashboard/DashboardPageClient.tsx");
  const shell = read("src/components/dashboard/DashboardShell.tsx");
  const slidePanel = read("src/components/dashboard/DashboardSlidePanel.tsx");

  assert.match(pageClient, /messages=\{chat\.messages\}/);
  assert.match(shell, /messages:\s*AgentChatMessage\[\]/);
  assert.match(shell, /messages=\{messages\}/);
  assert.match(slidePanel, /messages:\s*AgentChatMessage\[\]/);
  assert.match(slidePanel, /function buildConversationSummary/);
  assert.match(slidePanel, /<h3>当前对话<\/h3>/);
  assert.match(slidePanel, /className="sunny-dashboard-context-summary"/);
  assert.doesNotMatch(slidePanel, /<SectionGroup title="当前上下文"/);
  assert.doesNotMatch(slidePanel, /label=\{statusLabel\}/);
});
