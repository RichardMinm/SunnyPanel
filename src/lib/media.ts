import type { Media } from "@/payload-types";

export type MediaAsset = Media & {
  url: string;
};

export const getMediaAsset = (value: Media | number | null | undefined): MediaAsset | null => {
  if (!value || typeof value === "number") {
    return null;
  }

  if (typeof value.url !== "string" || value.url.length === 0) {
    return null;
  }

  return value as MediaAsset;
};

export const getMediaDisplayUrl = (asset: MediaAsset, preferredSize: "card" | "thumbnail" = "card") => {
  const sizedUrl = asset.sizes?.[preferredSize]?.url;

  return typeof sizedUrl === "string" && sizedUrl.length > 0 ? sizedUrl : asset.url;
};
