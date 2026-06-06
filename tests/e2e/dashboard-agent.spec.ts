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
  await expect(shell.locator(".sunny-agent-thread-header-title-text")).toHaveText("新会话");
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();
}

test("Dashboard 默认展示 Agent Workspace，而不是旧统计卡片首页", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  await expect(shell).toBeVisible();
  await expect(shell.locator(".sunny-agent-center-surface")).toBeVisible();
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
  await expect(nav.getByRole("button", { name: "搜索" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "命令中心" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "展开面板" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "收起面板" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "插件" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "自动化" })).toHaveCount(0);
  await expect(nav.getByText("会话")).toBeVisible();
  await expect(inspector).toBeHidden();
  await expect(shell.getByRole("button", { name: "展开检查器" })).toBeVisible();
  await expect(page.getByText("会话历史")).toHaveCount(0);
});

test("点击详情后右侧检查器展示五个中文页签", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const inspector = shell.getByRole("complementary", { name: "右侧检查器" });

  await expect(inspector).toBeHidden();
  await shell.getByRole("button", { name: "详情" }).click();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "收起检查器" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "上下文" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "审批" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "Trace" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "关联" })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "记忆" })).toBeVisible();
  await expect(inspector).not.toContainText("会话历史");
  await expect(inspector.getByRole("tab", { name: "Context" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "Approval" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "变更" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: "产物" })).toHaveCount(0);
});

test("Agent Composer 默认收敛为模式下拉、输入框、加号和发送", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const textarea = shell.getByLabel("输入要交给 Agent 的话");

  await expect(textarea).toBeVisible();
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "选择工作模式" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "打开快捷操作" })).toBeVisible();
  await expect(shell.locator(".sunny-agent-composer-mode-copy")).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "引用上下文" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: "发送" })).toBeVisible();

  await shell.getByRole("button", { name: "选择工作模式" }).click();
  await expect(shell.getByRole("menuitem", { name: /只回答/ })).toBeVisible();
  await expect(shell.getByRole("menuitem", { name: /^规划 / })).toBeVisible();
  await shell.getByRole("menuitem", { name: /只回答/ }).click();
  await expect(shell.getByRole("button", { name: "选择工作模式" })).toContainText("只回答");

  await shell.getByRole("button", { name: "打开快捷操作" }).click();
  await expect(shell.getByRole("menuitem", { name: "引用上下文" })).toBeVisible();
  await expect(shell.getByRole("menuitem", { name: "添加计划" })).toBeVisible();
  await expect(shell.getByRole("menuitem", { name: "斜杠命令" })).toBeVisible();
});

test("Dashboard 使用成熟 SaaS Agent 工作台视觉层级", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  await expect(shell).toHaveClass(/sunny-app-shell/);
  await expect(shell.locator(".sunny-main-workspace")).toBeVisible();
  await expect(shell.locator(".sunny-right-context-panel")).toBeHidden();
  await expect(shell.locator(".sunny-agent-composer")).toBeVisible();

  const sidebar = shell.getByRole("navigation", { name: "工作台导航" });
  await expect(sidebar).toHaveClass(/sunny-codex-sidebar/);
  await expect(sidebar.getByText("项目")).toBeVisible();
  await expect(sidebar.getByText("工作区")).toBeVisible();
  await expect(sidebar.getByText("会话")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "工作台" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "记忆库" })).toBeVisible();

  const contextPanel = shell.getByRole("complementary", { name: "右侧检查器" });
  await shell.getByRole("button", { name: "详情" }).click();
  await expect(contextPanel.getByRole("heading", { name: "上下文" })).toBeVisible();
  await expect(contextPanel.getByRole("tab", { name: "审批" })).toBeVisible();
  await expect(contextPanel.getByRole("tab", { name: "Trace" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "调整右侧面板宽度" })).toBeVisible();
  await expect(contextPanel.getByRole("button", { name: "收起检查器" })).toBeVisible();

  await expect(shell.getByRole("button", { name: "选择工作模式" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "引用上下文" })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "记忆库" }).click();
  await expect(shell.getByRole("heading", { name: "记忆库" })).toBeVisible();
  await expect(shell.getByText("来源会话")).toBeVisible();
});

test("移动端 Dashboard 优先展示主 Agent Workspace 且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const shell = await getDashboardShell(page);
  await startNewThread(shell);
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

  await shell.getByRole("button", { name: "展开检查器" }).click();
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeVisible();
  await shell.getByRole("button", { name: "收起检查器" }).click();
  await expect(shell.getByRole("complementary", { name: "右侧检查器" })).toBeHidden();
});

test("桌面端 Inspector 从右侧自身收起并从右边缘展开", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);
  const inspector = shell.getByRole("complementary", { name: "右侧检查器" });
  const nav = shell.getByRole("navigation", { name: "工作台导航" });

  await expect(inspector).toBeHidden();
  await shell.getByRole("button", { name: "详情" }).click();
  await expect(inspector).toBeVisible();
  await expect(nav.getByRole("button", { name: "收起检查器" })).toHaveCount(0);
  await inspector.getByRole("button", { name: "收起检查器" }).click();
  await expect(inspector).toBeHidden();
  await expect(shell.getByRole("button", { name: "展开检查器" })).toBeVisible();

  await shell.getByRole("button", { name: "展开检查器" }).click();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "收起检查器" })).toBeVisible();
});
