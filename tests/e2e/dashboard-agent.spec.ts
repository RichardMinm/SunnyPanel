import { expect, test } from "@playwright/test";

import {
  getDashboardShell,
  openDashboardInspector,
  startNewThread,
} from "./helpers/dashboard-shell";

test.describe.configure({ mode: "serial" });

test("Dashboard 默认展示 Agent Workspace，而不是旧统计卡片首页", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  await expect(shell).toBeVisible();
  await expect(shell.locator(".sunny-agent-center-surface")).toBeVisible();
  await expect(shell.getByRole("heading", { name: "今天想推进什么？" })).toBeVisible();
  await expect(shell.getByRole("status", { name: "Sunny 正在处理" })).toHaveCount(0);
  await expect(shell.getByText(/处理完成 \(\d+ 步\)/)).toHaveCount(0);
  await expect(page.getByText("内容队列")).toHaveCount(0);
  await expect(page.getByText("计划跑道")).toHaveCount(0);
  await expect(page.getByText("阶段时间线")).toHaveCount(0);
  await expect(shell.getByRole("alert")).toHaveCount(0);
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeHidden();
  await expect(page.getByText("加载失败")).toHaveCount(0);
});

test("Agent Workspace 左侧只负责导航，右侧检查器默认隐藏", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const nav = shell.getByRole("navigation", { name: "工作台导航" });
  const inspector = shell.getByRole("complementary", { name: "右侧检查器" });

  await expect(nav).toBeVisible();
  await expect(nav.locator(".sunny-codex-sidebar-window-controls")).toHaveCount(0);
  await expect(nav.getByText("主操作")).toBeVisible();
  await expect(nav.getByRole("button", { name: "新对话" })).toBeVisible();
  await nav.hover();
  await expect(nav.getByRole("searchbox", { name: "搜索会话" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "搜索" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "命令中心" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "展开面板" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "收起面板" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "插件" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "自动化" })).toHaveCount(0);
  await expect(nav.getByText("会话")).toBeVisible();
  await expect(inspector).toBeHidden();
  await expect(shell.getByRole("button", { name: "展开检查器" })).toHaveCount(0);
  await expect(page.getByText("会话历史")).toHaveCount(0);
});

test("展开检查器后右侧展示上下文 Icon 页签", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const inspector = await openDashboardInspector(shell);

  await expect(inspector.getByRole("button", { name: "收起检查器" })).toBeVisible();
  // Primary tabs always visible
  await expect(inspector.getByRole("tab", { name: "上下文" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "关联" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "记忆" })).toBeVisible();
  // Developer implementation details stay out of the product UI.
  await expect(inspector.getByRole("tab", { name: "Trace" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "复盘" })).toHaveCount(0);
  // Approval tab only shows when pending action exists (not in this test)
  await expect(inspector.getByRole("tab", { name: "审批" })).toHaveCount(0);
  await expect(inspector).not.toContainText("会话历史");
  await expect(inspector.getByRole("tab", { name: "Context" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "Approval" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "变更" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "产物" })).toHaveCount(0);
});

test("Agent Composer 默认只展示输入、上下文和发送", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const textarea = shell.getByLabel("输入要交给 Agent 的话");

  await expect(textarea).toBeVisible();
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "选择工作模式" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "添加上下文 / 文件 / 命令" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "添加上下文" })).toBeVisible();
  await expect(shell.locator(".sunny-agent-composer-mode-copy")).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "引用上下文" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "发送" })).toBeVisible();

  await expect(shell.getByText("DeepSeek V3", { exact: true })).toHaveCount(0);
  await expect(shell.locator(".sunny-agent-welcome-cards")).toHaveCount(0);
});

test("Dashboard 使用成熟 SaaS Agent 工作台视觉层级", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  await expect(shell).toHaveClass(/sunny-app-shell/);
  await expect(shell.locator(".sunny-main-workspace")).toBeVisible();
  await expect(shell.locator(".sunny-right-context-panel")).toBeHidden();
  await expect(shell.locator(".sunny-agent-composer")).toBeVisible();

  const sidebar = shell.getByRole("navigation", { name: "工作台导航" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("项目")).toBeVisible();
  await expect(sidebar.getByText("工作区")).toBeVisible();
  await expect(sidebar.getByText("会话")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "工作台" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "记忆库" })).toBeVisible();

  const contextPanel = await openDashboardInspector(shell);
  await expect(contextPanel.getByRole("heading", { name: "上下文", exact: true })).toBeVisible();
  await expect(contextPanel.getByRole("tab", { name: "上下文" })).toBeVisible();
  await expect(contextPanel.getByRole("tab", { name: "关联" })).toBeVisible();
  await expect(contextPanel.getByRole("tab", { name: "记忆" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "调整右侧面板宽度" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "收起检查器" })).toBeVisible();

  await expect(shell.getByRole("button", { name: "选择工作模式" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "引用上下文" })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "记忆库" }).click();
  await expect(shell.getByRole("heading", { name: "记忆库", exact: true })).toBeVisible();
  await expect(shell.getByRole("searchbox", { name: "搜索记忆标题..." })).toBeVisible();
  await expect(sidebar.getByRole("region", { name: "会话" })).toHaveCount(0);
  await expect(sidebar.getByRole("textbox", { name: "搜索会话" })).toHaveCount(0);
});

test("移动端 Dashboard 优先展示主 Agent Workspace 且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const shell = await getDashboardShell(page);
  const composerInput = shell.getByRole("textbox", { name: /输入要交给 Agent 的话|学习咨询上下文/ });

  await expect(shell).toBeVisible();
  await expect(composerInput).toBeVisible();
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const layoutStyles = await shell.evaluate((element) => {
    const main = element.querySelector<HTMLElement>(".sunny-dashboard-main");
    const slidePanel = element.querySelector<HTMLElement>(".sunny-dashboard-right-panel");

    return {
      mainGridColumn: main ? window.getComputedStyle(main).gridColumnStart : "missing",
      panelDisplay: slidePanel ? window.getComputedStyle(slidePanel).display : "missing",
    };
  });

  expect(overflow).toBe(false);
  expect(layoutStyles.mainGridColumn).not.toBe("missing");
  expect(layoutStyles.panelDisplay).toBe("none");

  await openDashboardInspector(shell);
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeVisible();
  await shell
    .getByRole("complementary", { name: "右侧检查器" })
    .getByRole("button", { name: "收起检查器" })
    .click();
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeHidden();
});

test("桌面端 Inspector 可通过 Composer 面板按钮展开并在面板头收起", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const inspector = shell.getByRole("complementary", { name: "右侧检查器" });

  await expect(inspector).toBeHidden();
  await openDashboardInspector(shell);
  await expect(inspector).toBeVisible();
  await expect(shell.getByRole("navigation", { name: "工作台导航" }).getByRole("button", { name: "收起检查器" })).toHaveCount(0);
  await inspector.getByRole("button", { name: "收起检查器" }).click();
  await expect(inspector).toBeHidden();
  await expect(shell.getByRole("button", { name: "展开检查器" })).toHaveCount(0);

  await shell.getByRole("button", { name: "添加上下文" }).click();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "收起检查器" })).toBeVisible();
});
