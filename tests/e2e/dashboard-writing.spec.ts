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

  await workspace.getByPlaceholder("未命名").fill("E2E 写作页冒烟");
  await workspace.getByRole("button", { name: "预览" }).click();
  await expect(workspace.getByRole("button", { name: "返回编辑" })).toBeVisible();
  await workspace.getByRole("button", { name: "返回编辑" }).click();

  const showInspector = workspace.getByRole("button", { name: "展开属性栏" });
  if (await showInspector.isVisible()) {
    await showInspector.click();
  }
  const metadata = workspace.getByRole("complementary", { name: "写作属性" });
  await metadata.getByRole("button", { name: "关联", exact: true }).click();
  await metadata.getByRole("button", { name: "关联计划" }).click();

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page).not.toHaveURL(/mode=plans|mode=writing/);
  const planInspector = page.getByRole("complementary", { name: "右侧检查器" });
  await expect(planInspector).toBeVisible();
  await expect(planInspector.getByRole("tab", { name: "计划" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("历史版本恢复不会覆盖其他窗口刚保存的内容", async ({ page }) => {
  await loginIfConfigured(page);

  const uniqueTitle = `E2E 版本冲突 ${Date.now()}`;
  const createResponse = await page.request.post("/api/dashboard/content", {
    data: { collection: "pages", title: uniqueTitle },
  });
  expect(createResponse.status()).toBe(201);

  const created = (await createResponse.json()) as {
    document: { id: number; updatedAt: string };
  };
  const documentId = created.document.id;

  try {
    const firstSaveResponse = await page.request.patch(
      `/api/dashboard/content/pages/${documentId}`,
      {
        data: {
          lastKnownUpdatedAt: created.document.updatedAt,
          title: `${uniqueTitle} · 版本 A`,
        },
      },
    );
    expect(firstSaveResponse.ok()).toBe(true);
    const firstSave = (await firstSaveResponse.json()) as {
      document: { updatedAt: string };
    };

    const versionsResponse = await page.request.get(
      `/api/dashboard/content/pages/${documentId}/versions`,
    );
    expect(versionsResponse.ok()).toBe(true);
    const versionsBody = (await versionsResponse.json()) as {
      versions?: Array<{ id: string }>;
    };
    const versionId = versionsBody.versions?.[0]?.id;
    expect(versionId).toBeTruthy();
    if (!versionId) throw new Error("版本历史应至少包含一个可恢复版本");

    await page.waitForTimeout(20);
    const secondSaveResponse = await page.request.patch(
      `/api/dashboard/content/pages/${documentId}`,
      {
        data: {
          lastKnownUpdatedAt: firstSave.document.updatedAt,
          title: `${uniqueTitle} · 版本 B`,
        },
      },
    );
    expect(secondSaveResponse.ok()).toBe(true);

    const conflictResponse = await page.request.post(
      `/api/dashboard/content/pages/${documentId}/versions`,
      {
        data: {
          lastKnownUpdatedAt: firstSave.document.updatedAt,
          versionId,
        },
      },
    );
    expect(conflictResponse.status()).toBe(409);
    const conflictBody = await conflictResponse.json();
    expect(conflictBody).toMatchObject({
      message: "内容已在其他位置更新",
    });

    const currentResponse = await page.request.get(
      `/api/dashboard/content/pages/${documentId}`,
    );
    expect(currentResponse.ok()).toBe(true);
    const currentBody = await currentResponse.json();
    expect(currentBody).toMatchObject({
      document: { title: `${uniqueTitle} · 版本 B` },
    });
  } finally {
    const cleanupResponse = await page.request.delete(
      `/api/dashboard/content/pages/${documentId}`,
    );
    expect(cleanupResponse.ok() || cleanupResponse.status() === 404).toBe(true);
  }
});
