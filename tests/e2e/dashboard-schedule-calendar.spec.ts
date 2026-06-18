import { expect, test } from "@playwright/test";

import { getDashboardShell, navigateToScheduleView, startNewThread } from "./helpers/dashboard-shell";

test.describe.configure({ mode: "serial" });

test("创建的日程出现在 Dashboard 日历视图中", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  // Step 1: Create the schedule via agent chat
  const prompt = "今天晚上五点钟创建日程，上产品经理课程";
  await shell.getByLabel("输入要交给 Agent 的话").fill(prompt);
  await shell.getByRole("button", { name: "发送" }).click();

  // Step 2: Wait for approval card and confirm
  const approval = shell.getByRole("region", { name: "待确认操作" });
  await expect(approval).toBeVisible({ timeout: 90_000 });
  await expect(approval).toContainText("17:00");
  await approval.getByRole("button", { name: "确认" }).click();

  // Step 3: Wait for success result card
  const result = shell.getByRole("region", { name: "日程创建结果" });
  await expect(result).toBeVisible({ timeout: 90_000 });
  await expect(result.getByRole("heading", { level: 3 })).toContainText("产品经理课程");
  await expect(result).toContainText("17:00-18:30");

  // Step 4: Navigate to schedule calendar view
  await navigateToScheduleView(shell);

  // Step 5: Verify the schedule appears in the calendar
  // The calendar should show at least 1 schedule item
  const scheduleCount = shell.locator(".sunny-schedule-month-count");
  await expect(scheduleCount).toContainText(/^\d+ 项日程$/);

  // The current month should be June 2026
  const monthHeading = shell.locator(".sunny-schedule-month-nav h2");
  await expect(monthHeading).toContainText("2026");

  // Click on the day cell for the 8th (today)
  const day8 = shell.locator(".sunny-schedule-day").filter({ hasText: "8" }).first();
  await day8.click();

  // The day detail panel should show the schedule
  const dayDetail = shell.locator(".sunny-schedule-day-detail");
  await expect(dayDetail).toBeVisible();
  await expect(dayDetail).toContainText("产品经理课程");
  await expect(dayDetail).toContainText("17:00");
});

test("日历视图空状态正常显示", async ({ page }) => {
  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  // Navigate to schedule view without creating any schedules
  await navigateToScheduleView(shell);

  // The calendar grid should be visible regardless
  await expect(shell.locator(".sunny-schedule-grid")).toBeVisible();

  // Month heading should show current month
  const monthHeading = shell.locator(".sunny-schedule-month-nav h2");
  await expect(monthHeading).toBeVisible();
});
