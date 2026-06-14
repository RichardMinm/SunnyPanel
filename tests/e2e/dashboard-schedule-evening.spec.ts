import { expect, test } from "@playwright/test";

import { getDashboardShell, startNewThread } from "./helpers/dashboard-shell";

test.describe.configure({ mode: "serial" });

test("晚上五点钟创建日程：待确认与结果卡显示 17:00-18:30", async ({ page }) => {
  test.setTimeout(120_000);

  const shell = await getDashboardShell(page);
  await startNewThread(shell);

  const prompt = "今天晚上五点钟创建日程，上产品经理课程";
  await shell.getByLabel("输入要交给 Agent 的话").fill(prompt);
  await shell.getByRole("button", { name: "发送" }).click();

  const approval = shell.getByRole("region", { name: "待确认操作" });
  await expect(approval).toBeVisible({ timeout: 90_000 });
  await expect(approval).toContainText("17:00");
  await expect(approval).not.toContainText("09:00-10:30");

  await approval.getByRole("button", { name: "确认" }).click();

  const result = shell.getByRole("region", { name: "日程创建结果" });
  await expect(result).toBeVisible({ timeout: 90_000 });
  await expect(result.getByRole("heading", { level: 3 })).toContainText("产品经理课程");
  await expect(result).toContainText("17:00-18:30");
});
