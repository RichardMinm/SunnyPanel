import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { RichTextContent } from "@/components/public/RichTextContent";
import { formatDateTime } from "@/lib/formatters";
import { getPublicPageBySlug, getPublicPages } from "@/lib/payload/public";

const managedPageMeta = {
  about: {
    description: "个人介绍、背景与站点说明。",
    title: "About",
  },
  now: {
    description: "当前正在做的事、近期状态与阶段重点。",
    title: "Now",
  },
} as const;

type StaticPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);
  const fallbackMeta = managedPageMeta[slug as keyof typeof managedPageMeta];

  if (!page) {
    if (fallbackMeta) {
      return {
        title: `${fallbackMeta.title} | SunnyPanel`,
        description: fallbackMeta.description,
      };
    }

    return {
      title: "页面未找到 | SunnyPanel",
    };
  }

  return {
    title: `${page.title} | SunnyPanel`,
    description: `${page.title} - SunnyPanel 页面`,
  };
}

export async function generateStaticParams() {
  const { docs } = await getPublicPages();
  const managedSlugs = Object.keys(managedPageMeta);

  return [...new Set([...docs.map((page) => page.slug), ...managedSlugs])].map((slug) => ({
    slug,
  }));
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);
  const fallbackMeta = managedPageMeta[slug as keyof typeof managedPageMeta];

  if (!page) {
    if (fallbackMeta) {
      return (
        <PublicSiteFrame>
          <main className="flex flex-1 flex-col gap-6 pb-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <Link href="/" className="sunny-button-secondary px-4 py-2 text-sm">
                返回首页
              </Link>
              <span className="sunny-badge sunny-badge-muted">{fallbackMeta.title}</span>
            </div>

            <section className="sunny-panel rounded-[1.6rem] px-5 py-5 md:px-6">
              <p className="sunny-kicker text-[0.68rem] text-muted">{fallbackMeta.title}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
                {fallbackMeta.title}
              </h1>
              <p className="mt-2 text-sm leading-7 text-muted">{fallbackMeta.description}</p>
            </section>

            <section className="sunny-panel rounded-[1.6rem] border-dashed px-5 py-5 text-sm leading-7 text-muted md:px-6">
              在后台创建一个 `Page`，并把 slug 设为 `{slug}`，这里就会显示正式内容。
            </section>
          </main>
        </PublicSiteFrame>
      );
    }

    notFound();
  }

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-6 pb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link href="/" className="sunny-button-secondary px-4 py-2 text-sm">
            返回首页
          </Link>
          <span className="sunny-badge sunny-badge-muted">Page</span>
          <span className="text-sm text-muted">最近更新：{formatDateTime(page.updatedAt)}</span>
        </div>

        <section className="sunny-panel rounded-[1.6rem] px-5 py-5 md:px-6">
          <p className="sunny-kicker text-[0.68rem] text-muted">Page</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
            {page.title}
          </h1>
        </section>

        <article className="sunny-card rounded-[1.8rem] p-6 md:p-8">
          <RichTextContent data={page.content} />
        </article>
      </main>
    </PublicSiteFrame>
  );
}
