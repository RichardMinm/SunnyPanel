import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function loginIfConfigured(page: import("@playwright/test").Page) {
  const email = process.env.AGENT_E2E_EMAIL ?? process.env.AGENT_SMOKE_EMAIL;
  const password = process.env.AGENT_E2E_PASSWORD ?? process.env.AGENT_SMOKE_PASSWORD;

  test.skip(!email || !password, "未配置 AGENT_E2E_EMAIL / AGENT_E2E_PASSWORD，跳过需登录的 Dashboard 合同");

  const response = await page.request.post("/api/users/login", {
    data: { email, password },
  });

  expect(response.ok()).toBe(true);

  const storageState = await page.request.storageState();
  await page.context().addCookies(storageState.cookies);
}

async function getDashboardShell(page: import("@playwright/test").Page) {
  await loginIfConfigured(page);
  const threadResponse = page.waitForResponse(
    (response) => response.url().includes("/api/agent/thread") && response.request().method() === "GET",
  );
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect((await threadResponse).ok()).toBe(true);

  return page.getByTestId("dashboard-shell");
}

async function startNewThread(shell: import("@playwright/test").Locator) {
  await shell.getByRole("button", { name: "新对话" }).click();
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();
}

test("Dashboard 默认展示 Agent Workspace，而不是旧统计卡片首页", async ({ page }) => {
  const shell = await getDashboardShell(page);

  await expect(shell).toBeVisible();
  await expect(shell.locator(".sunny-agent-center-surface")).toBeVisible();
  await expect(page.getByText("内容队列")).toHaveCount(0);
  await expect(page.getByText("计划跑道")).toHaveCount(0);
  await expect(page.getByText("阶段时间线")).toHaveCount(0);
  await expect(shell.getByRole("alert")).toHaveCount(0);
  await expect(shell.getByRole("complementary", { name: "右侧上下文面板" })).not.toContainText("加载失败");
});

test("Agent Workspace 左侧包含工作台导航、线程与待确认区域", async ({ page }) => {
  const shell = await getDashboardShell(page);
  const nav = shell.getByRole("navigation", { name: "工作台导航" });
  const slidePanel = shell.getByRole("complementary", { name: "右侧上下文面板" });

  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button", { name: "新对话" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "搜索" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "插件" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "自动化" })).toBeVisible();
  await expect(slidePanel).toBeVisible();
  await expect(slidePanel.getByRole("heading", { name: "当前对话" })).toBeVisible();
  await expect(slidePanel.getByText("对话摘要")).toBeVisible();
  await expect(slidePanel.getByRole("button", { name: "建议动作" })).toBeVisible();
  await expect(slidePanel.getByRole("button", { name: "风险提醒" })).toBeVisible();
  await expect(slidePanel.getByRole("button", { name: "会话历史" })).toBeVisible();
  await expect(slidePanel.getByRole("button", { name: "当前上下文" })).toHaveCount(0);
  await expect(slidePanel.locator(".sunny-task-item").filter({ hasText: "Agent 正在理解上下文" })).toHaveCount(0);
});

test("Agent Workspace 右侧以中文检查器页签作为主面板", async ({ page }) => {
  const shell = await getDashboardShell(page);

  await shell.getByRole("button", { name: "检查器" }).click();
  const inspectorTabs = page.getByRole("dialog", { name: "检查器面板" }).getByRole("tablist", { name: "Agent 详情面板" });

  await expect(inspectorTabs).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "上下文" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "确认" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "记录" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Context" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "Approval" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "Trace" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "变更" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "产物" })).toHaveCount(0);
});

test("Agent Composer 使用自动意图入口而不是五种模式选择器", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const textarea = shell.getByLabel("输入要交给 Agent 的话");

  await expect(textarea).toBeVisible();
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toHaveCount(0);
  await expect(shell.locator(".sunny-agent-composer-top")).toContainText("自动");
  await expect(shell.locator(".sunny-agent-composer-top")).not.toContainText("只回答");
  await expect(shell.locator(".sunny-agent-composer-top")).not.toContainText("生成建议");
  await expect(shell.getByRole("button", { name: "发送" })).toBeVisible();
});

test("Dashboard 使用成熟 SaaS Agent 工作台视觉层级", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  await expect(shell).toHaveClass(/sunny-app-shell/);
  await expect(shell.locator(".sunny-main-workspace")).toBeVisible();
  await expect(shell.locator(".sunny-right-context-panel")).toBeVisible();
  await expect(shell.locator(".sunny-agent-composer")).toBeVisible();

  const sidebar = shell.getByRole("navigation", { name: "工作台导航" });
  await expect(sidebar).toHaveClass(/sunny-codex-sidebar/);
  await expect(sidebar.getByText("项目")).toBeVisible();
  await expect(sidebar.getByText("工作区")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "工作台" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "记忆库" })).toBeVisible();

  const contextPanel = shell.getByRole("complementary", { name: "右侧上下文面板" });
  await expect(contextPanel.getByRole("heading", { name: "当前对话" })).toBeVisible();
  await expect(contextPanel.getByText("对话摘要")).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "建议动作" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "风险提醒" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "会话历史" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "调整右侧面板宽度" })).toBeVisible();

  await expect(shell.getByRole("button", { name: "自动模式" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "引用上下文" })).toBeVisible();

  await sidebar.getByRole("button", { name: "记忆库" }).click();
  await expect(shell.getByRole("heading", { name: "记忆库" })).toBeVisible();
  await expect(shell.getByText("来源会话")).toBeVisible();
});

test("移动端 Dashboard 优先展示主 Agent Workspace 且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const shell = await getDashboardShell(page);
  const composerInput = shell.getByRole("textbox", { name: /输入要交给 Agent 的话|学习咨询上下文/ });

  await expect(shell).toBeVisible();
  await expect(composerInput).toBeVisible();
  await expect(shell.getByRole("complementary", { name: "右侧上下文面板" })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const layoutStyles = await shell.evaluate((element) => {
    const main = element.querySelector<HTMLElement>(".sunny-dashboard-main");
    const slidePanel = element.querySelector<HTMLElement>(".sunny-dashboard-slide-panel");

    return {
      mainGridColumn: main ? window.getComputedStyle(main).gridColumnStart : "missing",
      panelDisplay: slidePanel ? window.getComputedStyle(slidePanel).display : "missing",
    };
  });

  expect(overflow).toBe(false);
  expect(layoutStyles.mainGridColumn).not.toBe("missing");
  expect(layoutStyles.panelDisplay).toBe("none");

  await shell.getByRole("button", { name: "展开面板" }).click();
  await expect(shell.getByRole("complementary", { name: "右侧上下文面板" })).toBeVisible();
  await shell.getByRole("button", { name: "收起面板" }).click();
  await expect(shell.getByRole("complementary", { name: "右侧上下文面板" })).toBeHidden();
});
