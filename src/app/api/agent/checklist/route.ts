import { type NextRequest, NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

type ChecklistItem = { completedAt?: null | string; completionNote?: null | string; description?: null | string; id?: string | null; isCompleted?: boolean | null; title?: string };

type ChecklistGroup = { id?: string | null; items?: ChecklistItem[] | null; title?: string };

function flattenItems(groups: ChecklistGroup[] | null | undefined) {
  const items: ChecklistItem[] = [];
  for (const group of groups ?? []) {
    for (const item of group.items ?? []) {
      if (item.title) items.push(item);
    }
  }
  return items;
}

export async function GET(request: NextRequest) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filterStatus = url.searchParams.get("status")?.trim() || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "checklists",
    depth: 0,
    limit,
    overrideAccess: true,
    sort: "-updatedAt",
    where: { status: { equals: "published" } },
  });

  const checklists = result.docs
    .map((doc) => {
      const checklist = doc as unknown as { groups?: ChecklistGroup[] | null; id: number; status?: string; title: string };
      const items = flattenItems(checklist.groups);
      const completedItems = items.filter((item) => item.isCompleted).length;

      // Compute display status
      let displayStatus = "active";
      if (items.length > 0 && completedItems === items.length) {
        displayStatus = "done";
      }

      return {
        completedItems,
        id: checklist.id,
        items: items.map((item) => ({
          completed: Boolean(item.isCompleted),
          key: item.id ?? item.title ?? "",
          label: item.title ?? "",
        })),
        relatedPlan: null,
        status: displayStatus,
        title: checklist.title,
        totalItems: items.length,
      };
    })
    .filter((cl) => {
      if (!filterStatus) return true;
      return cl.status === filterStatus;
    });

  return NextResponse.json({ checklists });
}
