import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  createPrivateCoreRecord,
  deletePrivateCoreRecord,
  getDashboardShell,
  loginIfConfigured,
  navigateToScheduleView,
  openDashboardInspector,
  queryPrivateCoreRecords,
  readPrivateCoreRecord,
  switchDashboardView,
  updatePrivateCoreRecord,
} from "./helpers/dashboard-shell";

test.describe.configure({ mode: "serial" });

type CoreRecord = Record<string, unknown> & { id: number };

const relationId = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "number") {
    return (value as { id: number }).id;
  }
  return null;
};

const assertThreadPreserved = async (page: Page, threadId: number) => {
  await expect(page).toHaveURL((url) => url.searchParams.get("threadId") === String(threadId));
};

const exactScheduleCard = (shell: Locator, title: string) =>
  shell
    .locator(".sunny-schedule-timeline-card")
    .filter({ hasText: title });

test("manual Schedule completion propagates and preserves exact linked navigation", async ({
  page,
}, testInfo) => {
  const user = await loginIfConfigured(page);
  const runKey = `e2e-manual-${Date.now()}-${testInfo.workerIndex}`;
  const dateKey = new Date().toISOString().slice(0, 10);
  const itemKey = `${runKey}-item`;
  const planTitle = `${runKey} Plan`;
  const checklistTitle = `${runKey} Checklist`;
  const itemTitle = `${runKey} exact item`;
  const scheduleTitle = `${runKey} Schedule`;
  const timelineTitle = `完成日程：${scheduleTitle}`;
  const created: Array<{ collection: string; id: number }> = [];

  try {
    const thread = await createPrivateCoreRecord<CoreRecord>(page, "agent-threads", {
      lastInteractionAt: new Date().toISOString(),
      messages: [],
      status: "active",
      title: `${runKey} Thread`,
      user: user.id,
    });
    created.push({ collection: "agent-threads", id: thread.id });

    const plan = await createPrivateCoreRecord<CoreRecord>(page, "plans", {
      agentState: "idle",
      domain: "other",
      executionMode: "manual",
      priority: "medium",
      progress: 0,
      state: "active",
      status: "draft",
      title: planTitle,
      visibility: "private",
    });
    created.push({ collection: "plans", id: plan.id });

    const checklist = await createPrivateCoreRecord<CoreRecord>(page, "checklists", {
      groups: [
        {
          id: `${runKey}-group`,
          items: [{ id: itemKey, isCompleted: false, title: itemTitle }],
          title: `${runKey} group`,
        },
      ],
      planId: plan.id,
      slug: runKey,
      status: "published",
      title: checklistTitle,
      visibility: "private",
    });
    created.push({ collection: "checklists", id: checklist.id });

    const schedule = await createPrivateCoreRecord<CoreRecord>(page, "schedule-items", {
      createdBy: "manual",
      date: `${dateKey}T00:00:00.000Z`,
      isAllDay: true,
      priority: "medium",
      relatedChecklist: checklist.id,
      relatedChecklistItemKey: itemKey,
      relatedPlan: plan.id,
      sourceType: "manual",
      status: "planned",
      title: scheduleTitle,
    });
    created.push({ collection: "schedule-items", id: schedule.id });

    const shell = await getDashboardShell(page, { threadId: thread.id });
    await assertThreadPreserved(page, thread.id);
    await navigateToScheduleView(shell);
    await assertThreadPreserved(page, thread.id);

    await shell.getByRole("button", { name: new RegExp(`^${dateKey}`) }).click();
    const scheduleCard = exactScheduleCard(shell, scheduleTitle);
    await expect(scheduleCard).toHaveCount(1);
    await scheduleCard.getByRole("button").first().click();
    await expect(scheduleCard).toHaveClass(/is-expanded/);

    const completionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/agent/schedule"
        && response.request().method() === "PUT",
    );
    await scheduleCard.getByRole("button", { name: "完成", exact: true }).click();
    await expect((await completionResponsePromise).ok()).toBe(true);
    await expect(scheduleCard).toContainText("已完成");
    await expect(scheduleCard.getByRole("button", { name: "完成", exact: true })).toHaveCount(0);

    const persistedSchedule = await readPrivateCoreRecord<CoreRecord>(
      page,
      "schedule-items",
      schedule.id,
    );
    expect(persistedSchedule.status).toBe("done");

    const persistedChecklist = await readPrivateCoreRecord<CoreRecord>(
      page,
      "checklists",
      checklist.id,
    );
    const persistedItems = (
      persistedChecklist.groups as Array<{ items?: Array<{ id?: string; isCompleted?: boolean }> }>
    ).flatMap((group) => group.items ?? []);
    expect(persistedItems.filter((item) => item.id === itemKey)).toEqual([
      expect.objectContaining({ id: itemKey, isCompleted: true }),
    ]);

    const persistedPlan = await readPrivateCoreRecord<CoreRecord>(page, "plans", plan.id);
    expect(persistedPlan.progress).toBe(100);

    const completionEvents = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "timeline-events",
      `where[relatedScheduleItem][equals]=${schedule.id}&limit=10&depth=0`,
    );
    expect(completionEvents).toHaveLength(1);
    const completionEvent = completionEvents[0];
    created.push({ collection: "timeline-events", id: completionEvent.id });
    expect(completionEvent).toEqual(
      expect.objectContaining({
        relatedTaskKey: null,
        sourceType: "schedule",
        status: "published",
        title: timelineTitle,
        visibility: "private",
      }),
    );
    expect(relationId(completionEvent.relatedPlan)).toBe(plan.id);
    expect(relationId(completionEvent.relatedChecklist)).toBe(checklist.id);
    expect(relationId(completionEvent.relatedScheduleItem)).toBe(schedule.id);

    const persistedPlanAfterTimeline = await readPrivateCoreRecord<CoreRecord>(
      page,
      "plans",
      plan.id,
    );
    expect(
      (persistedPlanAfterTimeline.linkedContent as Array<{ relationTo?: string; value?: unknown }>)
        .filter(
          (link) =>
            link.relationTo === "timeline-events"
            && relationId(link.value) === completionEvent.id,
        ),
    ).toHaveLength(1);

    await switchDashboardView(shell, "timeline");
    await assertThreadPreserved(page, thread.id);
    const timelineCard = shell
      .locator(".sunny-timeline-event-card")
      .filter({ hasText: timelineTitle });
    await expect(timelineCard).toHaveCount(1);
    await timelineCard.getByRole("button").first().click();
    await expect(timelineCard).toHaveClass(/is-expanded/);
    await expect(timelineCard.getByRole("button", { name: `打开计划：${planTitle}` })).toBeVisible();
    await expect(
      timelineCard.getByRole("button", { name: `打开清单：${checklistTitle}` }),
    ).toBeVisible();
    await expect(
      timelineCard.getByRole("button", { name: `打开日程：${scheduleTitle}` }),
    ).toBeVisible();

    await timelineCard.getByRole("button", { name: `打开计划：${planTitle}` }).click();
    await assertThreadPreserved(page, thread.id);
    const planCard = shell.getByRole("article", { name: `计划：${planTitle}` });
    await expect(planCard).toHaveAttribute("aria-current", "true");
    await expect(planCard.getByRole("button").first()).toHaveAttribute("aria-expanded", "true");
    await expect(planCard.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");

    await planCard.getByRole("button", { name: `打开清单：${checklistTitle}` }).click();
    await assertThreadPreserved(page, thread.id);
    const checklistCard = shell.locator('.sunny-checklist-card[aria-current="true"]');
    await expect(checklistCard).toContainText(checklistTitle);
    await expect(checklistCard.getByRole("button").first()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(checklistCard).toContainText("1/1 项完成");
    await expect(checklistCard.locator("li.is-done")).toHaveText(itemTitle);

    await checklistCard.getByRole("button", { name: `打开日程：${scheduleTitle}` }).click();
    await assertThreadPreserved(page, thread.id);
    const exactNavigatedSchedule = shell.locator(
      '.sunny-schedule-timeline-card[aria-current="true"]',
    );
    await expect(exactNavigatedSchedule).toContainText(scheduleTitle);
    await expect(exactNavigatedSchedule).toContainText("已完成");
    await expect(exactNavigatedSchedule.getByRole("button").first()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  } finally {
    for (const planRecord of created.filter((record) => record.collection === "plans")) {
      await updatePrivateCoreRecord(page, "plans", planRecord.id, {
        lastAgentRun: null,
      }).catch(() => undefined);
    }
    const timelineEvents = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "timeline-events",
      `where[relatedScheduleItem][exists]=true&limit=100&depth=0`,
    ).catch(() => []);
    for (const event of timelineEvents) {
      if (
        created.some(
          (record) =>
            record.collection === "schedule-items"
            && relationId(event.relatedScheduleItem) === record.id,
        )
      ) {
        await deletePrivateCoreRecord(page, "timeline-events", event.id);
      }
    }
    for (const record of created.reverse()) {
      await deletePrivateCoreRecord(page, record.collection, record.id);
    }
  }
});

test("Agent-confirmed Schedule completion exposes receipt metadata and rolls back the full linkage", async ({
  page,
}, testInfo) => {
  const user = await loginIfConfigured(page);
  const runKey = `e2e-agent-${Date.now()}-${testInfo.workerIndex}`;
  const dateKey = new Date().toISOString().slice(0, 10);
  const itemKey = `${runKey}-item`;
  const planTitle = `${runKey} Plan`;
  const checklistTitle = `${runKey} Checklist`;
  const itemTitle = `${runKey} exact item`;
  const scheduleTitle = `${runKey} Schedule`;
  const timelineTitle = `完成日程：${scheduleTitle}`;
  const created: Array<{ collection: string; id: number }> = [];

  try {
    const thread = await createPrivateCoreRecord<CoreRecord>(page, "agent-threads", {
      lastInteractionAt: new Date().toISOString(),
      messages: [],
      status: "active",
      title: `${runKey} Thread`,
      user: user.id,
    });
    created.push({ collection: "agent-threads", id: thread.id });

    const plan = await createPrivateCoreRecord<CoreRecord>(page, "plans", {
      agentState: "idle",
      domain: "other",
      executionMode: "manual",
      priority: "medium",
      progress: 0,
      state: "active",
      status: "draft",
      title: planTitle,
      visibility: "private",
    });
    created.push({ collection: "plans", id: plan.id });

    const checklist = await createPrivateCoreRecord<CoreRecord>(page, "checklists", {
      groups: [
        {
          id: `${runKey}-group`,
          items: [{ id: itemKey, isCompleted: false, title: itemTitle }],
          title: `${runKey} group`,
        },
      ],
      planId: plan.id,
      slug: runKey,
      status: "published",
      title: checklistTitle,
      visibility: "private",
    });
    created.push({ collection: "checklists", id: checklist.id });

    const schedule = await createPrivateCoreRecord<CoreRecord>(page, "schedule-items", {
      createdBy: "agent",
      date: `${dateKey}T00:00:00.000Z`,
      isAllDay: true,
      priority: "medium",
      relatedChecklist: checklist.id,
      relatedChecklistItemKey: itemKey,
      relatedPlan: plan.id,
      sourceType: "agent",
      status: "planned",
      title: scheduleTitle,
    });
    created.push({ collection: "schedule-items", id: schedule.id });

    const shell = await getDashboardShell(page, { threadId: thread.id });
    await assertThreadPreserved(page, thread.id);

    const completionRequest = `将日程 #${schedule.id}「${scheduleTitle}」标记为完成`;
    await shell.getByLabel("输入要交给 Agent 的话").fill(completionRequest);
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/agent/chat"
        && response.request().method() === "POST",
    );
    await shell.getByRole("button", { name: "发送", exact: true }).click();
    await expect((await chatResponsePromise).ok()).toBe(true);

    const approval = shell.getByRole("region", { name: "待确认操作" });
    await expect(approval).toBeVisible({ timeout: 90_000 });
    await expect(approval).toContainText(scheduleTitle);
    await expect(approval.getByRole("button", { name: "确认", exact: true })).toBeVisible();
    await assertThreadPreserved(page, thread.id);

    const confirmationResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/agent/chat"
        && response.request().method() === "POST",
    );
    await approval.getByRole("button", { name: "确认", exact: true }).click();
    await expect((await confirmationResponsePromise).ok()).toBe(true);
    await expect(approval).toBeHidden();
    await assertThreadPreserved(page, thread.id);

    await expect.poll(async () => {
      const record = await readPrivateCoreRecord<CoreRecord>(
        page,
        "schedule-items",
        schedule.id,
      );
      return record.status;
    }).toBe("done");

    const persistedChecklist = await readPrivateCoreRecord<CoreRecord>(
      page,
      "checklists",
      checklist.id,
    );
    const persistedItems = (
      persistedChecklist.groups as Array<{
        items?: Array<{ id?: string; isCompleted?: boolean }>;
      }>
    ).flatMap((group) => group.items ?? []);
    expect(persistedItems.filter((item) => item.id === itemKey)).toEqual([
      expect.objectContaining({ id: itemKey, isCompleted: true }),
    ]);

    const persistedPlan = await readPrivateCoreRecord<CoreRecord>(page, "plans", plan.id);
    expect(persistedPlan.progress).toBe(100);

    const planTimelineEvents = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "timeline-events",
      `where[relatedPlan][equals]=${plan.id}&limit=100&depth=0`,
    );
    for (const event of planTimelineEvents) {
      if (!created.some((record) => record.collection === "timeline-events" && record.id === event.id)) {
        created.push({ collection: "timeline-events", id: event.id });
      }
    }
    const completionEvents = planTimelineEvents.filter(
      (event) => relationId(event.relatedScheduleItem) === schedule.id,
    );
    expect(completionEvents).toHaveLength(1);
    const completionEvent = completionEvents[0];
    expect(completionEvent).toEqual(
      expect.objectContaining({
        relatedTaskKey: null,
        sourceType: "schedule",
        status: "published",
        title: timelineTitle,
        visibility: "private",
      }),
    );
    expect(relationId(completionEvent.relatedPlan)).toBe(plan.id);
    expect(relationId(completionEvent.relatedChecklist)).toBe(checklist.id);
    expect(relationId(completionEvent.relatedScheduleItem)).toBe(schedule.id);
    expect(
      (persistedPlan.linkedContent as Array<{ relationTo?: string; value?: unknown }>).filter(
        (link) =>
          link.relationTo === "timeline-events"
          && relationId(link.value) === completionEvent.id,
      ),
    ).toHaveLength(1);

    const receipts = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "agent-action-receipts",
      `where[thread][equals]=${thread.id}&where[operation][equals]=execute&limit=10&depth=0`,
    );
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    created.push({ collection: "agent-action-receipts", id: receipt.id });
    expect(receipt).toEqual(
      expect.objectContaining({
        intent: "modify_record",
        operation: "execute",
        status: "succeeded",
      }),
    );
    expect(receipt.rollbackPayload).toEqual(
      expect.objectContaining({ strategy: "restore_schedule_completion" }),
    );
    const receiptResponse = receipt.response as Record<string, unknown>;
    expect(receiptResponse.lastRollbackPayload).toEqual(
      expect.objectContaining({ strategy: "restore_schedule_completion" }),
    );
    expect(
      typeof receiptResponse.lastRollbackSourceRunId === "number"
      && Number.isSafeInteger(receiptResponse.lastRollbackSourceRunId)
      && receiptResponse.lastRollbackSourceRunId > 0,
    ).toBe(true);
    const rollbackSourceRunId = receiptResponse.lastRollbackSourceRunId as number;
    created.push({ collection: "agent-runs", id: rollbackSourceRunId });
    const sourceRun = await readPrivateCoreRecord<CoreRecord>(
      page,
      "agent-runs",
      rollbackSourceRunId,
    );
    expect(sourceRun).toEqual(
      expect.objectContaining({
        rollbackAvailable: true,
        status: "succeeded",
      }),
    );
    expect(sourceRun.rollbackPayload).toEqual(
      expect.objectContaining({ strategy: "restore_schedule_completion" }),
    );

    const rollbackResponse = await page.request.post("/api/agent/rollback", {
      data: { sourceRunId: rollbackSourceRunId },
    });
    const rollbackResponseBody = await rollbackResponse.json().catch(() => null);
    expect(
      rollbackResponse.ok(),
      `rollback response: ${JSON.stringify(rollbackResponseBody)}`,
    ).toBe(true);
    await assertThreadPreserved(page, thread.id);

    await expect.poll(async () => {
      const record = await readPrivateCoreRecord<CoreRecord>(
        page,
        "schedule-items",
        schedule.id,
      );
      return record.status;
    }).toBe("planned");

    const restoredChecklist = await readPrivateCoreRecord<CoreRecord>(
      page,
      "checklists",
      checklist.id,
    );
    const restoredItems = (
      restoredChecklist.groups as Array<{
        items?: Array<{ id?: string; isCompleted?: boolean }>;
      }>
    ).flatMap((group) => group.items ?? []);
    expect(restoredItems.filter((item) => item.id === itemKey)).toEqual([
      expect.objectContaining({ id: itemKey, isCompleted: false }),
    ]);

    const restoredPlan = await readPrivateCoreRecord<CoreRecord>(page, "plans", plan.id);
    expect(restoredPlan.progress).toBe(0);
    expect(
      (restoredPlan.linkedContent as Array<{ relationTo?: string; value?: unknown }>).filter(
        (link) =>
          link.relationTo === "timeline-events"
          && relationId(link.value) === completionEvent.id,
      ),
    ).toHaveLength(0);

    const restoredCompletionEvents = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "timeline-events",
      `where[relatedScheduleItem][equals]=${schedule.id}&limit=10&depth=0`,
    );
    expect(restoredCompletionEvents).toHaveLength(0);
    const consumedSourceRun = await readPrivateCoreRecord<CoreRecord>(
      page,
      "agent-runs",
      rollbackSourceRunId,
    );
    expect(consumedSourceRun.rollbackAvailable).toBe(false);
    expect(consumedSourceRun.nextAction).toContain("已执行撤销");
    expect(consumedSourceRun.trace).toEqual(
      expect.objectContaining({
        rollbackClaim: expect.objectContaining({ state: "consumed" }),
      }),
    );

    await switchDashboardView(shell, "timeline");
    await expect(
      shell.locator(".sunny-timeline-event-card").filter({ hasText: timelineTitle }),
    ).toHaveCount(0);
    await switchDashboardView(shell, "checklist");
    const restoredChecklistCard = shell
      .locator(".sunny-checklist-card")
      .filter({ hasText: checklistTitle });
    await restoredChecklistCard.getByRole("button").first().click();
    await expect(restoredChecklistCard).toContainText("0/1 项完成");
    await expect(restoredChecklistCard.locator("li.is-done")).toHaveCount(0);
    await navigateToScheduleView(shell);
    await shell.getByRole("button", { name: new RegExp(`^${dateKey}`) }).click();
    const restoredScheduleCard = exactScheduleCard(shell, scheduleTitle);
    await expect(restoredScheduleCard).toHaveCount(1);
    await restoredScheduleCard.getByRole("button").first().click();
    await expect(restoredScheduleCard).not.toContainText("已完成");
    await expect(
      restoredScheduleCard.getByRole("button", { name: "完成", exact: true }),
    ).toBeVisible();
    await switchDashboardView(shell, "agent");
    const inspector = await openDashboardInspector(shell);
    await inspector.getByRole("tab", { name: "计划", exact: true }).click();
    const restoredPlanCard = inspector.getByRole("article", {
      name: `计划：${planTitle}`,
    });
    await expect(restoredPlanCard.getByRole("meter")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(restoredPlanCard).toContainText("关联时间线 0");
    await assertThreadPreserved(page, thread.id);
  } finally {
    const timelineEvents = await queryPrivateCoreRecords<CoreRecord>(
      page,
      "timeline-events",
      `where[relatedScheduleItem][exists]=true&limit=100&depth=0`,
    ).catch(() => []);
    for (const event of timelineEvents) {
      if (
        created.some(
          (record) =>
            record.collection === "schedule-items"
            && relationId(event.relatedScheduleItem) === record.id,
        )
      ) {
        await deletePrivateCoreRecord(page, "timeline-events", event.id);
      }
    }
    for (const record of created.reverse()) {
      await deletePrivateCoreRecord(page, record.collection, record.id);
    }
  }
});
