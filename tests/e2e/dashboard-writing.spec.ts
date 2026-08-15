import { test, expect } from "@playwright/test";

import { loginIfConfigured } from "./helpers/dashboard-shell";

test("写作工作台可进入并切换预览", async ({ page }) => {
  await loginIfConfigured(page);
  await page.goto("/dashboard?mode=writing", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\?mode=writing/);

  const workspace = page.getByTestId("dashboard-writing-workspace");
  await expect(workspace).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "工作台导航" });
  await navigation.hover();
  await navigation.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("menuitem", { name: "新文章" }).click();

  await workspace.getByRole("textbox", { name: "标题" }).fill("E2E 写作页冒烟");
  await workspace.getByRole("button", { name: "预览" }).click();
  await expect(workspace.getByRole("button", { name: "返回编辑" })).toBeVisible();
});
