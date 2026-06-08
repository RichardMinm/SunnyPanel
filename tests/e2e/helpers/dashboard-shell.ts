import { expect, test, type Locator, type Page } from "@playwright/test";

export async function loginIfConfigured(page: Page) {
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

export async function getDashboardShell(page: Page) {
  await loginIfConfigured(page);
  const threadResponse = page.waitForResponse(
    (response) => response.url().includes("/api/agent/thread") && response.request().method() === "GET",
  );
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect((await threadResponse).ok()).toBe(true);

  return page.getByTestId("dashboard-shell");
}

export async function startNewThread(shell: Locator) {
  await shell.getByRole("button", { name: "新对话" }).click();
  await expect(shell.locator(".sunny-agent-thread-header-title-text")).toHaveText("新会话");
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();
}

export async function navigateToScheduleView(shell: Locator) {
  // Click the "日程" (schedule) button in the sidebar
  await shell.getByRole("button", { name: "日程" }).click();
  // Wait for the schedule month view to load
  await expect(shell.locator(".sunny-schedule-month-view")).toBeVisible({ timeout: 30_000 });
  // Wait for schedule items to load (should show count text like "1 项日程")
  await expect(shell.locator(".sunny-schedule-month-count")).toBeVisible({ timeout: 30_000 });
}
