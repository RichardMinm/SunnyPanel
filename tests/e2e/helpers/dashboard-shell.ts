import { expect, test, type Locator, type Page } from "@playwright/test";

type AuthenticatedDashboardUser = {
  id: number;
};

const pageAuthTokens = new WeakMap<Page, string>();

type DashboardView = "agent" | "checklist" | "schedule" | "timeline";

const dashboardViewLabels: Record<DashboardView, string> = {
  agent: "工作台",
  checklist: "清单",
  schedule: "日程",
  timeline: "时间线",
};

const dashboardViewHeadings: Record<DashboardView, string> = {
  agent: "新任务",
  checklist: "清单",
  schedule: "日程安排",
  timeline: "时间线",
};

const dashboardViewApiPath: Partial<Record<DashboardView, string>> = {
  checklist: "/api/agent/checklist",
  schedule: "/api/agent/schedule",
  timeline: "/api/agent/timeline",
};

const assertLocalBaseUrl = () => {
  const rawBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const baseUrl = new URL(rawBaseUrl);
  const local =
    (baseUrl.protocol === "http:" || baseUrl.protocol === "https:")
    && ["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname);

  test.skip(!local, "Dashboard linkage E2E 只允许 localhost / 127.0.0.1");
};

export async function loginIfConfigured(
  page: Page,
): Promise<AuthenticatedDashboardUser> {
  assertLocalBaseUrl();
  const email = process.env.AGENT_E2E_EMAIL ?? process.env.AGENT_SMOKE_EMAIL;
  const password = process.env.AGENT_E2E_PASSWORD ?? process.env.AGENT_SMOKE_PASSWORD;

  test.skip(!email || !password, "未配置 AGENT_E2E_EMAIL / AGENT_E2E_PASSWORD，跳过需登录的 Dashboard 合同");
  if (!email || !password) {
    throw new Error("Dashboard E2E credentials are required");
  }

  const response = await page.request.post("/api/users/login", {
    data: { email, password },
  });

  expect(response.ok()).toBe(true);

  const storageState = await page.request.storageState();
  await page.context().addCookies(storageState.cookies);

  const data = (await response.json()) as {
    token?: unknown;
    user?: { id?: unknown };
  };
  expect(typeof data.user?.id).toBe("number");
  expect(typeof data.token).toBe("string");
  pageAuthTokens.set(page, data.token as string);
  return { id: data.user!.id as number };
}

const getPayloadAuthHeaders = (page: Page) => {
  const token = pageAuthTokens.get(page);
  expect(token, "登录响应应提供仅驻留内存的 Payload token").toBeTruthy();
  return { Authorization: `JWT ${token}` };
};

export async function createPrivateCoreRecord<T extends { id: number }>(
  page: Page,
  collection: string,
  data: Record<string, unknown>,
): Promise<T> {
  assertLocalBaseUrl();
  const response = await page.request.post(`/api/${collection}`, {
    data,
    headers: getPayloadAuthHeaders(page),
  });
  expect(response.ok(), `创建 ${collection} 测试记录应成功（HTTP ${response.status()}）`).toBe(
    true,
  );
  const result = (await response.json()) as unknown;
  const document = (
    result
    && typeof result === "object"
    && "doc" in result
    && result.doc
      ? result.doc
      : result
  ) as T;
  expect(Number.isSafeInteger(document.id) && document.id > 0).toBe(true);
  return document;
}

export async function readPrivateCoreRecord<T extends { id: number }>(
  page: Page,
  collection: string,
  id: number,
): Promise<T> {
  assertLocalBaseUrl();
  const response = await page.request.get(`/api/${collection}/${id}?depth=2`, {
    headers: getPayloadAuthHeaders(page),
  });
  expect(response.ok(), `读取 ${collection} #${id} 应成功（HTTP ${response.status()}）`).toBe(
    true,
  );
  return (await response.json()) as T;
}

export async function queryPrivateCoreRecords<T extends { id: number }>(
  page: Page,
  collection: string,
  query: string,
): Promise<T[]> {
  assertLocalBaseUrl();
  const response = await page.request.get(`/api/${collection}?${query}`, {
    headers: getPayloadAuthHeaders(page),
  });
  expect(response.ok(), `查询 ${collection} 应成功（HTTP ${response.status()}）`).toBe(true);
  const data = (await response.json()) as { docs?: T[] };
  return data.docs ?? [];
}

export async function deletePrivateCoreRecord(
  page: Page,
  collection: string,
  id: number,
) {
  assertLocalBaseUrl();
  const response = await page.request.delete(`/api/${collection}/${id}`, {
    headers: getPayloadAuthHeaders(page),
  });
  expect(
    response.ok() || response.status() === 404,
    `清理 ${collection} #${id} 应成功或已不存在（HTTP ${response.status()}）`,
  ).toBe(true);
}

export async function getDashboardShell(
  page: Page,
  options: { threadId?: number } = {},
) {
  await loginIfConfigured(page);
  const threadResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/agent/thread"
        && response.request().method() === "GET"
        && (
          options.threadId === undefined
          || url.searchParams.get("threadId") === String(options.threadId)
        )
      );
    },
  );
  const dashboardUrl =
    options.threadId === undefined
      ? "/dashboard"
      : `/dashboard?threadId=${options.threadId}`;
  await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
  await expect((await threadResponse).ok()).toBe(true);

  const shell = page.getByTestId("dashboard-shell");
  await expect(shell).toBeVisible();
  return shell;
}

export async function startNewThread(shell: Locator) {
  await shell.getByRole("button", { name: "新对话" }).click();
  await expect(shell.locator(".sunny-agent-thread-header-title-text")).toHaveText("新会话");
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();
}

export async function switchDashboardView(
  shell: Locator,
  view: DashboardView,
) {
  const page = shell.page();
  const apiPath = dashboardViewApiPath[view];
  const responsePromise = apiPath
    ? page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === apiPath
          && response.request().method() === "GET",
      )
    : null;

  await shell
    .getByRole("navigation", { name: "工作台导航" })
    .getByRole("button", { name: dashboardViewLabels[view], exact: true })
    .click();

  if (responsePromise) {
    await expect((await responsePromise).ok()).toBe(true);
  }

  if (view === "agent") {
    await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();
  } else {
    await expect(
      shell.getByRole("heading", {
        name: dashboardViewHeadings[view],
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
  }
}

export async function navigateToScheduleView(shell: Locator) {
  await switchDashboardView(shell, "schedule");
  await expect(shell.locator(".sunny-schedule-month-view")).toBeVisible({ timeout: 30_000 });
  await expect(shell.getByRole("region", { name: "月历" })).toBeVisible();
  await expect(shell.getByRole("complementary", { name: "当日安排" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "上个月" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "下个月" })).toBeVisible();
}
