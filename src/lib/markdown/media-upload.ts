export const uploadMarkdownImage = async (file: File): Promise<string> => {
  const body = new FormData();
  body.append("file", file);
  body.append("alt", file.name.replace(/\.[^.]+$/, "") || "image");

  const response = await fetch("/api/editor/upload-media", {
    body,
    credentials: "include",
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");

    throw new Error(message || `图片上传失败（${response.status}）`);
  }

  const data = (await response.json()) as { url?: string };

  if (!data.url) {
    throw new Error("图片上传未返回 URL");
  }

  return data.url;
};
