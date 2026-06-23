export type DashboardMediaUploadResult = {
  id: number;
  url: string;
};

export async function uploadDashboardMedia(
  file: File,
  alt?: string,
): Promise<DashboardMediaUploadResult> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("alt", alt?.trim() || file.name.replace(/\.[^.]+$/, "") || "media");

  const response = await fetch("/api/editor/upload-media", {
    body: formData,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("文件上传失败");
  }

  return (await response.json()) as DashboardMediaUploadResult;
}
