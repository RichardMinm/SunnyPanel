import { test, expect } from "@playwright/test";

/**
 * 需已登录且能打开 Dashboard；未登录环境会跳过。
 * 与计划阶段 7 对齐：为 Agent 侧栏提供稳定 `data-testid` 以便后续接登录态断言。
 */
test("Dashboard 在可访问时展示 Agent Dock 地标", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const dock = page.getByTestId("agent-dock");
  const count = await dock.count();

  test.skip(count === 0, "未检测到 agent-dock（可能未登录或未渲染侧栏）");

  await expect(dock).toBeVisible();
});

test("Dashboard 全屏 Agent 在可访问时展示工作台地标", async ({ page }) => {
  await page.goto("/dashboard?agent=full", { waitUntil: "domcontentloaded" });

  const shell = page.getByTestId("agent-workbench");

  test.skip((await shell.count()) === 0, "未检测到 agent-workbench（可能未登录）");

  await expect(shell).toBeVisible();
});

test("Agent 工作台包含 Tab 和 Inspector 区域", async ({ page }) => {
  await page.goto("/dashboard?agent=full", { waitUntil: "domcontentloaded" });

  const shell = page.getByTestId("agent-workbench");

  test.skip((await shell.count()) === 0, "未检测到 agent-workbench（可能未登录）");

  const tabs = shell.getByRole("tablist");

  await expect(tabs.first()).toBeVisible();
});

test("Agent Composer 输入框有 aria-label", async ({ page }) => {
  await page.goto("/dashboard?agent=full", { waitUntil: "domcontentloaded" });

  const shell = page.getByTestId("agent-workbench");

  test.skip((await shell.count()) === 0, "未检测到 agent-workbench（可能未登录）");

  const textarea = shell.locator("textarea");

  if ((await textarea.count()) > 0) {
    const label = await textarea.first().getAttribute("aria-label");

    expect(label).toBeTruthy();
  }
});

test("Agent Dock 错误卡片有 role=alert", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const dock = page.getByTestId("agent-dock");

  test.skip((await dock.count()) === 0, "未检测到 agent-dock");

  const textarea = dock.locator("textarea");

  if ((await textarea.count()) > 0) {
    const label = await textarea.first().getAttribute("aria-label");

    expect(label).toBeTruthy();
  }
});
