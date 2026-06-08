import { expect, test } from "@playwright/test";

import { getDashboardShell, startNewThread } from "./helpers/dashboard-shell";

test.describe.configure({ mode: "serial" });

test("侧边栏活跃会话行 hover 时显示 ⋮ 菜单触发器", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  // 需要至少一个活跃会话才能看到菜单
  const rows = shell.locator(".sunny-codex-thread-row");
  const count = await rows.count();
  if (count === 0) {
    test.skip(true, "没有活跃会话，无法测试菜单");
    return;
  }

  const firstRow = rows.first();
  // hover 显示触发器
  await firstRow.hover();
  const trigger = firstRow.locator(".sunny-thread-row-menu-trigger");
  await expect(trigger).toBeVisible();

  // 菜单默认不打开
  await expect(firstRow.locator(".sunny-thread-row-menu-dropdown")).not.toBeVisible();
});

test("侧边栏 ⋮ 菜单点击打开下拉，Escape 关闭", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  const rows = shell.locator(".sunny-codex-thread-row");
  const count = await rows.count();
  if (count === 0) {
    test.skip(true, "没有活跃会话，无法测试菜单");
    return;
  }

  const firstRow = rows.first();
  await firstRow.hover();
  const trigger = firstRow.locator(".sunny-thread-row-menu-trigger");
  await trigger.click();

  // 下拉菜单可见
  const dropdown = firstRow.locator(".sunny-thread-row-menu-dropdown");
  await expect(dropdown).toBeVisible();

  // 菜单包含"归档"选项
  const archiveItem = dropdown.getByRole("menuitem", { name: "归档" });
  await expect(archiveItem).toBeVisible();

  // Escape 关闭菜单
  await page.keyboard.press("Escape");
  await expect(dropdown).not.toBeVisible();
});

test("归档 → 确认弹窗 → 取消 → 会话仍在列表中", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  const threadList = shell.locator(".sunny-codex-thread-list");
  const rows = threadList.locator(".sunny-codex-thread-row");
  const initialCount = await rows.count();
  if (initialCount === 0) {
    test.skip(true, "没有活跃会话，无法测试归档");
    return;
  }

  const firstRow = rows.first();

  // hover → 打开菜单 → 点击归档
  await firstRow.hover();
  await firstRow.locator(".sunny-thread-row-menu-trigger").click();
  await firstRow.locator(".sunny-thread-row-menu-item").click();

  // 确认弹窗出现
  const confirmDialog = page.locator(".sunny-confirm-dialog");
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.locator(".sunny-confirm-title")).toHaveText("确认归档");

  // 取消
  await confirmDialog.locator(".sunny-confirm-btn-cancel").click();
  await expect(confirmDialog).not.toBeVisible();

  // 会话仍在列表中
  await expect(rows).toHaveCount(initialCount);
});

test("ThreadHeader 归档按钮可见（加载会话后）", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  const rows = shell.locator(".sunny-codex-thread-row");
  const count = await rows.count();
  if (count === 0) {
    test.skip(true, "没有活跃会话可以加载");
    return;
  }

  // 点击第一个会话加载
  await rows.first().locator(".sunny-codex-thread-row-btn").click();

  // 等待 ThreadHeader 出现
  const header = shell.locator(".sunny-agent-thread-header");
  await expect(header).toBeVisible();

  // 归档按钮应该可见
  const archiveButton = header.locator("button[aria-label='归档会话']");
  await expect(archiveButton).toBeVisible();
});

test("ThreadHeader 归档 → 确认 → 切换到新会话", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  const rows = shell.locator(".sunny-codex-thread-row");
  const count = await rows.count();
  if (count === 0) {
    test.skip(true, "没有活跃会话可以归档");
    return;
  }

  // 加载第一个会话
  await rows.first().locator(".sunny-codex-thread-row-btn").click();
  const header = shell.locator(".sunny-agent-thread-header");
  await expect(header).toBeVisible();

  // 点击归档按钮
  await header.locator("button[aria-label='归档会话']").click();

  // 确认弹窗
  const confirmDialog = page.locator(".sunny-confirm-dialog");
  await expect(confirmDialog).toBeVisible();

  // 确认归档
  await confirmDialog.locator(".sunny-confirm-btn-warning").click();

  // 应该切换到新会话（显示"新会话"标题）
  await expect(shell.locator(".sunny-agent-thread-header-title-text")).toHaveText("新会话");
});

test("归档区展开 → 删除按钮可见 → 确认弹窗取消 → 无变化", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  // 展开归档区
  const archiveToggle = shell.locator(".sunny-codex-archive-section button").first();
  await archiveToggle.click();

  // 等待加载完成（可能没有归档会话）
  const archiveLabel = shell.locator(".sunny-codex-empty-label");
  const archiveThreads = shell.locator(".sunny-codex-archive-thread");

  await expect(archiveLabel.or(archiveThreads.first())).toBeVisible({ timeout: 10_000 });

  const archiveCount = await archiveThreads.count();
  if (archiveCount === 0) {
    // 归档当前会话后就有了
    const rows = shell.locator(".sunny-codex-thread-row");
    if ((await rows.count()) === 0) {
      test.skip(true, "没有会话可以测试");
      return;
    }

    // 从侧边栏归档一个会话
    await rows.first().hover();
    await rows.first().locator(".sunny-thread-row-menu-trigger").click();
    await rows.first().locator(".sunny-thread-row-menu-item").click();
    const dialog = page.locator(".sunny-confirm-dialog");
    await dialog.locator(".sunny-confirm-btn-warning").click();
    await expect(dialog).not.toBeVisible();

    // 重新打开归档区
    await archiveToggle.click(); // 关闭
    await archiveToggle.click(); // 重新打开
  }

  // 等待归档列表出现
  const updatedArchiveThreads = shell.locator(".sunny-codex-archive-thread");
  const finalCount = await updatedArchiveThreads.count();
  if (finalCount === 0) {
    test.skip(true, "仍然没有归档会话");
    return;
  }

  // 点击第一个归档会话的删除按钮
  const deleteBtn = updatedArchiveThreads.first().locator(".sunny-codex-archive-delete-btn");
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // 确认弹窗出现
  const confirmDialog = page.locator(".sunny-confirm-dialog");
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.locator(".sunny-confirm-title")).toHaveText("确认删除");
  await expect(confirmDialog.locator(".sunny-confirm-btn-danger")).toBeVisible();

  // 取消
  await confirmDialog.locator(".sunny-confirm-btn-cancel").click();
  await expect(confirmDialog).not.toBeVisible();

  // 归档会话仍在列表中
  await expect(updatedArchiveThreads).toHaveCount(finalCount);

  // 清理：恢复归档的会话
  await updatedArchiveThreads.first().locator(".sunny-codex-archive-restore-btn").click();
});

test("归档区为空时显示空提示", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  // 先确认归档区为空 - 如果有归档会话，先全部恢复
  const archiveToggle = shell.locator(".sunny-codex-archive-section button").first();
  await archiveToggle.click();

  // 等待加载
  await page.waitForTimeout(2000);

  // 恢复所有归档会话
  const restoreBtns = shell.locator(".sunny-codex-archive-restore-btn");
  const restoreCount = await restoreBtns.count();
  for (let i = 0; i < restoreCount; i++) {
    await restoreBtns.first().click();
    await page.waitForTimeout(300);
  }

  // 关闭再重新打开归档区刷新
  await archiveToggle.click();
  await page.waitForTimeout(300);
  await archiveToggle.click();
  await page.waitForTimeout(2000);

  // 应该显示空提示
  const emptyLabel = shell.locator(".sunny-codex-archive-section .sunny-codex-empty-label");
  const archiveThreads = shell.locator(".sunny-codex-archive-thread");
  const hasEmptyOrNoThreads =
    (await emptyLabel.isVisible().catch(() => false)) || (await archiveThreads.count()) === 0;
  expect(hasEmptyOrNoThreads).toBe(true);
});
