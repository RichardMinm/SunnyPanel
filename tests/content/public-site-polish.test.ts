import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HomeHero } from "@/components/public/HomeHero";

const read = (path: string) => readFileSync(path, "utf8");

describe("Public site polish contracts", () => {
  test("homepage hero renders the AI-native long-term workbench positioning", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeHero, {
        currentFocus: {
          focus: {
            description: "SunnyPanel 第一版正在推进。",
            href: "/checklists",
            label: "Checklist",
            title: "SunnyPanel v1",
          },
          lastUpdated: "2026-07-04",
          recentAction: {
            date: "2026-07-04",
            description: "补充公开写作体验。",
            href: "/blog",
            label: "Blog",
            title: "Public writing polish",
          },
        },
        locale: "zh",
      }),
    );

    assert.match(html, /SunnyPanel/);
    assert.match(html, /AI 原生/);
    assert.match(html, /个人长期工作台/);
    assert.match(html, /查看 Now/);
    assert.match(html, /阅读写作/);
  });

  test("public writing pages keep Blog Notes and Updates visually distinct", () => {
    const blogPage = read("src/app/(site)/blog/page.tsx");
    const notesPage = read("src/app/(site)/notes/page.tsx");
    const updatesPage = read("src/app/(site)/updates/page.tsx");

    assert.match(blogPage, /sunny-blog-index/);
    assert.match(notesPage, /sunny-notes-stream/);
    assert.match(updatesPage, /sunny-updates-feed/);
    assert.doesNotMatch(notesPage, /grid gap-4 md:grid-cols-2/);
  });

  test("public Blog and Checklists pages do not surface admin management CTAs", () => {
    const blogPage = read("src/app/(site)/blog/page.tsx");
    const checklistsPage = read("src/app/(site)/checklists/page.tsx");

    assert.doesNotMatch(blogPage, /\/admin\/collections\/posts/);
    assert.doesNotMatch(checklistsPage, /\/admin\/collections\/checklists/);
    assert.doesNotMatch(blogPage, /managePosts/);
    assert.doesNotMatch(checklistsPage, /manageChecklists/);
  });

  test("public checklists page presents progress instead of a backend task table", () => {
    const checklistsPage = read("src/app/(site)/checklists/page.tsx");

    assert.match(checklistsPage, /sunny-public-checklist-progress/);
    assert.match(checklistsPage, /role="progressbar"/);
    assert.match(checklistsPage, /aria-valuenow/);
    assert.match(checklistsPage, /formatDateTime\(checklist\.updatedAt/);
  });

  test("blog detail keeps a readable article shell and article body renderer", () => {
    const blogDetail = read("src/app/(site)/blog/[slug]/page.tsx");

    assert.match(blogDetail, /sunny-public-article-shell/);
    assert.match(blogDetail, /ContentRenderer/);
    assert.match(blogDetail, /readingTime/);
    assert.match(blogDetail, /backList/);
  });

  test("timeline page exposes narrative archive semantics", () => {
    const timelinePage = read("src/components/public/timeline/TimelinePageContent.tsx");

    assert.match(timelinePage, /sunny-timeline-narrative/);
    assert.match(timelinePage, /TimelineArchive/);
    assert.match(timelinePage, /featuredSection/);
  });
});
