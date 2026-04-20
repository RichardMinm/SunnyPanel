import { buildEditorState } from "@payloadcms/richtext-lexical";
import type { Payload } from "payload";

import type { User } from "@/payload-types";

const createDraftPageContent = (headline: string, paragraphs: string[]) =>
  buildEditorState({
    text: [headline, ...paragraphs].join("\n\n"),
  });

export const ensureInitialWorkspace = async (payload: Payload, user: User) => {
  const [aboutPage, nowPage, existingPlans] = await Promise.all([
    payload.find({
      collection: "pages",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: {
          equals: "about",
        },
      },
    }),
    payload.find({
      collection: "pages",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: {
          equals: "now",
        },
      },
    }),
    payload.find({
      collection: "plans",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
    }),
  ]);

  const operations: Promise<unknown>[] = [];

  if (aboutPage.totalDocs === 0) {
    operations.push(
      payload.create({
        collection: "pages",
        data: {
          title: "About",
          slug: "about",
          status: "draft",
          visibility: "public",
          content: createDraftPageContent("从这里开始介绍你自己。", [
            "可以写你的背景、正在关注的方向，以及你为什么要做 SunnyPanel。",
            "V1 建议先用两到三段短内容把自我介绍写清楚，再决定是否扩展成更完整的长期页面。",
          ]),
        },
        overrideAccess: true,
      }),
    );
  }

  if (nowPage.totalDocs === 0) {
    operations.push(
      payload.create({
        collection: "pages",
        data: {
          title: "Now",
          slug: "now",
          status: "draft",
          visibility: "public",
          content: createDraftPageContent("这里适合记录你最近在推进什么。", [
            "建议把这一页保持简洁：当前重点、最近状态、接下来一两周想做的事。",
            "它不需要像博客那样完整，更像一个会持续更新的状态窗口。",
          ]),
        },
        overrideAccess: true,
      }),
    );
  }

  if (existingPlans.totalDocs === 0) {
    operations.push(
      payload.create({
        collection: "plans",
        data: {
          title: "完善 About 与 Now 页面",
          description: "先把自我介绍和当前状态两页补到可发布，建立公开站点最基础的说明层。",
          state: "active",
          status: "draft",
          priority: "high",
          visibility: "private",
        },
        overrideAccess: true,
      }),
    );
    operations.push(
      payload.create({
        collection: "plans",
        data: {
          title: "发布第一条公开内容",
          description: "选择 Post、Note 或 Update 中最轻的一种，尽快让站点出现第一条真正面向外部的内容。",
          state: "backlog",
          status: "draft",
          priority: "high",
          visibility: "private",
        },
        overrideAccess: true,
      }),
    );
    operations.push(
      payload.create({
        collection: "plans",
        data: {
          title: `整理 ${user.displayName || user.email} 的第一条 Timeline 节点`,
          description: "挑一个最近的阶段性变化写进 Timeline，让公开叙事从第一条 milestone 开始沉淀。",
          state: "backlog",
          status: "draft",
          priority: "medium",
          visibility: "private",
        },
        overrideAccess: true,
      }),
    );
  }

  await Promise.all(operations);
};

type BuildOnboardingChecklistArgs = {
  activePlans: number;
  publicContentItems: number;
  publicPages: number;
  timelineEvents: number;
};

export const buildOnboardingChecklist = ({
  activePlans,
  publicContentItems,
  publicPages,
  timelineEvents,
}: BuildOnboardingChecklistArgs) => {
  const tasks = [
    {
      title: "补完 About / Now",
      description: "把两页改成你自己的内容并发布，让站点先具备最基础的自我说明。",
      href: "/admin/collections/pages",
      done: publicPages >= 2,
    },
    {
      title: "确认一个 active 计划",
      description: "确保至少有一个正在推进的私有计划，dashboard 才会像真正的工作台。",
      href: "/admin/collections/plans",
      done: activePlans > 0,
    },
    {
      title: "发布第一条公开内容",
      description: "先发出一条 Post、Note 或 Update，建立公开表达层的最小闭环。",
      href: "/admin",
      done: publicContentItems > 0,
    },
    {
      title: "写入第一条 Timeline",
      description: "给时间线落下第一个节点，后续内容才会慢慢连成叙事骨架。",
      href: "/admin/collections/timeline-events",
      done: timelineEvents > 0,
    },
  ];

  return {
    completed: tasks.filter((task) => task.done).length,
    tasks,
    total: tasks.length,
  };
};
