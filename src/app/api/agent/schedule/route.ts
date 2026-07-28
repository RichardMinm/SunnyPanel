import { NextResponse } from "next/server";

import { loadScheduleSummaries } from "@/lib/core-linkage/api-summaries";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { executeAtomicScheduleStatusUpdate } from "@/lib/schedule/atomic-schedule-status-update";
import { createScheduleStatusHandler, type ScheduleStatusDependencies } from "@/lib/schedule/schedule-status-handler";
import {
  completeScheduleItem,
  createTransactionalScheduleCompletionPayload,
} from "@/lib/schedule/complete-schedule-item";

const scheduleStatusDependencies: ScheduleStatusDependencies = {
  atomicUpdateStatus: ({ data, itemId, payload }) => executeAtomicScheduleStatusUpdate({
    adapter: payload as unknown as Parameters<typeof executeAtomicScheduleStatusUpdate>[0]["adapter"],
    itemId,
    status: data.status,
    updatedAt: new Date().toISOString(),
  }),
  completeScheduleItem: (input) => completeScheduleItem({
    ...input,
    payload: input.payload as Parameters<typeof completeScheduleItem>[0]["payload"],
  }),
  createTransactionalScheduleCompletionPayload: ({ payload }) => createTransactionalScheduleCompletionPayload({
    payload: payload as Parameters<typeof createTransactionalScheduleCompletionPayload>[0]["payload"],
  }),
  getPayloadAuthResult,
  getPayloadClient,
  readCurrentScheduleStatus: async ({ itemId, payload, user }) => {
    try {
      const item = await (payload as Awaited<ReturnType<typeof getPayloadClient>>).db.findOne({
        collection: "schedule-items",
        req: { user: user as never },
        where: { id: { equals: itemId } },
      });
      return { item, ok: true };
    } catch {
      return { ok: false };
    }
  },
};

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { message: "需要 month 参数，格式 YYYY-MM" },
      { status: 400 },
    );
  }

  const [year, m] = monthParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, m - 1, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);

  const payload = await getPayloadClient();
  const items = await loadScheduleSummaries(payload, authResult.user, { monthEnd, monthStart });

  return NextResponse.json({ month: monthParam, items, count: items.length });
}

export async function PUT(request: Request) {
  return createScheduleStatusHandler(scheduleStatusDependencies)(request);
}
