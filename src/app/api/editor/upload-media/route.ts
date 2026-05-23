import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const alt = formData.get("alt");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const payload = await getPayloadClient();
  const media = await payload.create({
    collection: "media",
    data: {
      alt: typeof alt === "string" && alt.trim() ? alt.trim() : file.name.replace(/\.[^.]+$/, "") || "image",
    },
    file: {
      data: buffer,
      mimetype: file.type || "application/octet-stream",
      name: file.name,
      size: buffer.length,
    },
    overrideAccess: true,
    user: authResult.user,
  });

  const url = typeof media.url === "string" ? media.url : null;

  if (!url) {
    return NextResponse.json({ error: "Upload succeeded but media URL is missing" }, { status: 500 });
  }

  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || new URL(request.url).origin;
  const absoluteUrl = url.startsWith("http") ? url : `${serverURL.replace(/\/$/, "")}${url}`;

  return NextResponse.json({
    id: media.id,
    url: absoluteUrl,
  });
}
