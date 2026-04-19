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

            <section className="sunny-card sunny-card-strong rounded-[2.2rem] p-8 md:p-10">
              <p className="sunny-kicker text-xs text-muted">Static page</p>
              <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
                {fallbackMeta.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
                {fallbackMeta.description}
              </p>
            </section>

            <section className="sunny-card rounded-[2.2rem] p-8 md:p-10">
              <span className="sunny-badge sunny-badge-muted">Waiting for content</span>
              <p className="mt-5 text-base leading-8 text-muted">
                这个固定页面的前台能力已经接好。你只需要在 Payload 后台新建一个
                `Page`，把 slug 设为 `{slug}`，并发布为 `public`，这里就会自动展示正式内容。
              </p>
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

        <section className="sunny-card sunny-card-strong rounded-[2.2rem] p-8 md:p-10">
          <p className="sunny-kicker text-xs text-muted">Static page</p>
          <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
            {page.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
            这个页面来自 Payload 的 `Page` collection，适合承载 About、Now 这类长期存在的固定内容。
          </p>
        </section>

        <article className="sunny-card rounded-[2.2rem] p-8 md:p-10">
          <RichTextContent data={page.content} />
        </article>
      </main>
    </PublicSiteFrame>
  );
}
