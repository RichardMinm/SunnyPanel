import { test, expect } from "@playwright/test";

test("写作工作台可进入并切换预览", async ({ page }) => {
  await page.goto("/admin/login?redirect=%2Fdashboard%3Fmode%3Dwriting");

  const email = process.env.AGENT_E2E_EMAIL;
  const password = process.env.AGENT_E2E_PASSWORD;

  test.skip(!email || !password, "需要 AGENT_E2E_EMAIL 与 AGENT_E2E_PASSWORD");

  await page.getByLabel(/邮箱|Email/).fill(email!);
  await page.getByLabel(/密码|Password/).fill(password!);
  await page.getByRole("button", { name: /登录|Login/ }).click();

  await page.waitForURL(/\/dashboard\?mode=writing/, { timeout: 60_000 });

  const workspace = page.getByTestId("dashboard-writing-workspace");
  await expect(workspace).toBeVisible();

  await workspace.getByRole("button", { name: "新建" }).click();
  await workspace.getByRole("menuitem", { name: "新文章" }).click();

  await workspace.getByRole("textbox", { name: "标题" }).fill("E2E 写作页冒烟");
  await workspace.getByRole("button", { name: "预览" }).click();
  await expect(workspace.getByRole("button", { name: "返回编辑" })).toBeVisible();
});
