import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/shared/rate-limit";

export const enforceDashboardContentRateLimit = (userId: number, bucket: string) => {
  const rateLimit = checkRateLimit(`${bucket}:${userId}`, 120, 60_000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "请求过于频繁，请稍后再试" },
      {
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
        status: 429,
      },
    );
  }

  return null;
};
