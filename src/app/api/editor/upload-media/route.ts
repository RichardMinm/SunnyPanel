import { NextResponse } from "next/server";

import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
  "video/mp4",
  "video/webm",
]);

const isAllowedMimeType = (value: string) =>
  value.startsWith("image/") || allowedMimeTypes.has(value);

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

  if (!isAllowedMimeType(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const payload = await getPayloadClient();
  const media = await payload.create({
    collection: "media",
    data: {
      alt: typeof alt === "string" && alt.trim() ? alt.trim() : file.name.replace(/\.[^.]+$/, "") || "image",
      visibility: "private",
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
