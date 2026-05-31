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

async function getWorkbench(page: import("@playwright/test").Page) {
  await loginIfConfigured(page);
  const threadResponse = page.waitForResponse(
    (response) => response.url().includes("/api/agent/thread") && response.request().method() === "GET",
  );
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect((await threadResponse).ok()).toBe(true);

  return page.getByTestId("agent-workbench");
}

test("Dashboard 默认展示 Agent Workspace，而不是旧统计卡片首页", async ({ page }) => {
  const shell = await getWorkbench(page);

  await expect(shell).toBeVisible();
  await expect(page.getByTestId("dashboard-agent-host")).toBeVisible();
  await expect(page.getByText("内容队列")).toHaveCount(0);
  await expect(page.getByText("计划跑道")).toHaveCount(0);
  await expect(page.getByText("阶段时间线")).toHaveCount(0);
  await expect(shell.getByRole("alert")).toHaveCount(0);
  await expect(shell.getByTestId("agent-sidebar")).not.toContainText("加载失败");
});

test("Agent Workspace 左侧包含工作台导航、线程与待确认区域", async ({ page }) => {
  const shell = await getWorkbench(page);

  await expect(shell.getByTestId("agent-sidebar")).toBeVisible();
  await expect(shell.getByTestId("agent-workspace-nav")).toContainText("总览");
  await expect(shell.getByTestId("agent-workspace-nav")).toContainText("计划");
  await expect(shell.getByTestId("agent-thread-list")).toBeVisible();
  await expect(shell.getByTestId("agent-pending-list")).toBeVisible();
  await expect(shell.getByTestId("agent-pinned-list")).toBeVisible();
});

test("Agent Workspace 右侧以 Context / Approval / Trace 作为主面板", async ({ page }) => {
  const shell = await getWorkbench(page);

  const inspectorTabs = shell.getByRole("tablist", { name: "Agent 详情面板" });

  await expect(inspectorTabs).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Context" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Approval" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Trace" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "变更" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "产物" })).toHaveCount(0);
});

test("Agent Composer 使用命令式可访问输入", async ({ page }) => {
  const shell = await getWorkbench(page);
  const textarea = shell.getByLabel("输入要交给 Agent 的话");

  await expect(textarea).toBeVisible();
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toContainText("只回答");
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toContainText("不写入数据库");
  await expect(shell.locator(".sunny-agent-composer-top")).toContainText("时间线 ·");
  await expect(shell.getByRole("button", { name: "发送" })).toBeVisible();
});

test("移动端 Dashboard 优先展示主 Agent Workspace 且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const shell = await getWorkbench(page);

  await expect(shell).toBeVisible();
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const layoutStyles = await shell.evaluate((element) => {
    const host = document.querySelector<HTMLElement>('[data-testid="dashboard-agent-host"]');
    const style = window.getComputedStyle(element);

    return {
      hostMaxWidth: host ? window.getComputedStyle(host).maxWidth : "none",
      overflowY: style.overflowY,
    };
  });

  expect(overflow).toBe(false);
  expect(layoutStyles.overflowY).toBe("auto");
  expect(layoutStyles.hostMaxWidth).not.toBe("none");
});
