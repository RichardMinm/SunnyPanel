import { notFound, redirect } from "next/navigation";

import { DocumentLivePreview } from "@/components/public/DocumentLivePreview";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import { buildLivePreviewPath, isPreviewCollectionSlug, type PreviewCollectionSlug } from "@/lib/payload/preview";
import { getSiteLocale } from "@/lib/site-locale";

export const dynamic = "force-dynamic";

type PreviewPageProps = {
  params: Promise<{
    collection: string;
    id: string;
  }>;
};

const buildAdminLoginRedirect = (path: string) => `/admin/login?redirect=${encodeURIComponent(path)}`;

export default async function PreviewDocumentPage({ params }: PreviewPageProps) {
  const { collection, id } = await params;

  if (!isPreviewCollectionSlug(collection)) {
    notFound();
  }

  const previewPath = buildLivePreviewPath({
    collection,
    id,
  });

  if (!previewPath) {
    notFound();
  }

  const numericId = Number(id);

  if (Number.isNaN(numericId)) {
    notFound();
  }

  const payload = await getPayloadClient();
  const authResult = await getPayloadAuthResult();

  if (!authResult.user) {
    redirect(buildAdminLoginRedirect(previewPath));
  }

  const locale = await getSiteLocale();
  const document = await payload.findByID({
    collection: collection as PreviewCollectionSlug,
    id: numericId,
    depth: 2,
    overrideAccess: true,
  });

  if (!document) {
    notFound();
  }

  return (
    <PublicSiteFrame locale={locale} showTimelineRail={false}>
      <DocumentLivePreview
        collection={collection as PreviewCollectionSlug}
        id={id}
        initialData={document}
        locale={locale}
      />
    </PublicSiteFrame>
  );
}
