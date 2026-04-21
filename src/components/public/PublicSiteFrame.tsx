"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "首页" },
  { href: "/about", label: "About" },
  { href: "/now", label: "Now" },
  { href: "/checklists", label: "清单" },
  { href: "/blog", label: "Blog" },
  { href: "/notes", label: "Notes" },
  { href: "/updates", label: "Updates" },
  { href: "/timeline", label: "Timeline" },
];

type PublicSiteFrameProps = {
  children: ReactNode;
};

export function PublicSiteFrame({ children }: PublicSiteFrameProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-[74rem] flex-1 flex-col px-4 py-4 md:px-6 lg:px-8">
      <header className="sunny-panel sticky top-4 z-20 rounded-[1.7rem] px-4 py-3.5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="group inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] bg-accent text-sm font-bold text-white shadow-[0_14px_30px_rgba(143,53,16,0.22)] transition group-hover:-translate-y-0.5">
                S
              </span>
              <div>
                <p className="sunny-kicker text-[0.68rem] text-accent-strong">SunnyPanel</p>
                <p className="text-[0.82rem] text-muted">个人表达与私有运营面板</p>
              </div>
            </Link>
          </div>

          <nav className="flex flex-wrap gap-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sunny-nav-link ${
                  pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                    ? "sunny-nav-link-active"
                    : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" className="sunny-button-secondary">
              私有工作台
            </Link>
            <Link href="/admin" className="sunny-button-primary">
              进入后台
            </Link>
          </div>
        </div>
      </header>

      <div className="relative mt-6 flex-1">
        <div className="sunny-orbit right-[-2rem] top-12 hidden h-28 w-28 lg:block" />
        <div className="sunny-orbit left-[-1rem] top-[32rem] hidden h-20 w-20 lg:block" />
        {children}
      </div>

      <footer className="mt-9 rounded-[1.8rem] border border-border/80 bg-white/45 px-5 py-6 backdrop-blur md:px-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="sunny-kicker text-xs text-muted">SunnyPanel</p>
            <p className="mt-3 text-sm leading-7 text-muted">
              一个给个人长期使用的系统原型：公开侧负责表达、记录和回看，私有侧负责计划、
              内容运营和媒体管理。
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-muted">
            <Link href="/blog" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
              写作
            </Link>
            <Link href="/timeline" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
              时间线
            </Link>
            <Link href="/dashboard" className="sunny-nav-link px-0 py-0 hover:bg-transparent">
              工作台
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
