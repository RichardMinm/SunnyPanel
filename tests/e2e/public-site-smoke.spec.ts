import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/blog", "/notes", "/timeline", "/tags/test"] as const;
const emptyDatabaseRoutes = ["/about", "/categories/test"] as const;

test.describe("public site smoke", () => {
  for (const route of publicRoutes) {
    test(`${route} renders public surface`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(response?.ok()).toBe(true);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  for (const route of emptyDatabaseRoutes) {
    test(`${route} returns the intentional not-found surface`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(response?.status()).toBe(404);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("mobile public homepage smoke", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("h1")).toContainText("SunnyPanel");
  });
});
