export const previewCollections = [
  "posts",
  "pages",
  "notes",
  "updates",
  "checklists",
  "timeline-events",
] as const;

export type PreviewCollectionSlug = (typeof previewCollections)[number];

export const livePreviewBreakpoints = [
  {
    label: "手机",
    name: "mobile",
    width: 390,
    height: 844,
  },
  {
    label: "平板",
    name: "tablet",
    width: 820,
    height: 1180,
  },
  {
    label: "桌面",
    name: "desktop",
    width: 1440,
    height: 1024,
  },
] as const;

export const isPreviewCollectionSlug = (value: string): value is PreviewCollectionSlug =>
  previewCollections.includes(value as PreviewCollectionSlug);

export const buildLivePreviewPath = ({
  collection,
  id,
}: {
  collection: PreviewCollectionSlug;
  id?: number | string;
}) => {
  if (!id) {
    return null;
  }

  return `/preview/${collection}/${id}`;
};
