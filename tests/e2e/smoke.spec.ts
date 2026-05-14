import { test, expect } from "@playwright/test";

test("首页可访问（无鉴权断言）", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
});

test("Dashboard 在未登录时可重定向或返回页面", async ({ page }) => {
  const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeGreaterThanOrEqual(200);
  expect(response?.status()).toBeLessThan(500);
});
