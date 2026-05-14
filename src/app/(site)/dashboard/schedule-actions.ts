"use server";

import { revalidatePath } from "next/cache";

import { updateScheduleItemStatus } from "@/lib/schedule/items";

export async function updateScheduleStatusAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = formData.get("status");

  if (!Number.isFinite(id) || (status !== "done" && status !== "skipped")) {
    return;
  }

  await updateScheduleItemStatus(id, status);
  revalidatePath("/dashboard");
}
