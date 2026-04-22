import Image from "next/image";

import { getMediaAssetFromRecord, getMediaDisplayUrl } from "@/lib/media";

type RecordCoverImageProps = {
  containerClassName?: string;
  imageClassName: string;
  preferredSize?: "card" | "thumbnail";
  priority?: boolean;
  record: null | Record<string, unknown> | undefined;
};

export function RecordCoverImage({
  containerClassName,
  imageClassName,
  preferredSize = "card",
  priority = false,
  record,
}: RecordCoverImageProps) {
  const coverImage = getMediaAssetFromRecord(record);

  if (!coverImage) {
    return null;
  }

  return (
    <div className={containerClassName}>
      <Image
        alt={coverImage.alt}
        className={imageClassName}
        height={coverImage.height || 720}
        priority={priority}
        src={getMediaDisplayUrl(coverImage, preferredSize)}
        unoptimized
        width={coverImage.width || 1280}
      />
    </div>
  );
}
