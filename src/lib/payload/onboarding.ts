import { buildEditorState } from "@payloadcms/richtext-lexical";
import type { Payload, Where } from "payload";

import type { AgentRun, Plan, User } from "@/payload-types";

const createRichTextContent = (headline: string, paragraphs: string[]) =>
  buildEditorState({
    text: [headline, ...paragraphs].join("\n\n"),
  });

const samplePublishedAt = "2026-04-23T08:30:00.000Z";

const aboutPageSeed = {
  content: createRichTextContent("SunnyPanel 是一个把公开表达和私有工作流放到一起的个人系统。", [
    "我希望它既能承接文章、动态、时间线，也能承接计划、清单和长期回顾，不再把写作和执行拆成两套完全割裂的工具。",
    "这一版先把最小闭环做扎实：可发布内容、可维护页面、可回看的时间线，以及一个真正能帮助自己推进事情的私有工作台。",
  ]),
  slug: "about",
  title: "About",
};

const nowPageSeed = {
  content: createRichTextContent("当前重点是把 SunnyPanel 收成一个可以长期使用的个人面板。", [
    "这段时间主要在补公开层和私有层之间的连接，让首页、时间线、动态流和工作台可以互相支撑，而不是各自孤立。",
    "接下来会继续做两件事：先让内容种子和默认工作流更完整，再慢慢打磨视觉、移动端和长期维护体验。",
  ]),
  slug: "now",
  title: "Now",
};

const starterPostSeed = {
  content: createRichTextContent("SunnyPanel 正在从一个纯技术搭建，变成一个真正能长期使用的个人系统。", [
    "这次整理最重要的变化，不是多了几个页面，而是开始把内容生产、阶段记录和私有计划真正放到同一条链路里。",
    "首页不再只是一个空壳，时间线也不再只是孤立列表。文章、动态、清单和工作台开始互相连接，系统终于有了持续更新的基础。",
    "接下来会继续减少占位态和手工步骤，让第一次启动后就能拥有一套可浏览、可编辑、可继续扩展的默认工作区。",
  ]),
  publishedAt: samplePublishedAt,
  slug: "sunnypanel-starter-workspace",
  summary: "记录 SunnyPanel 从“结构搭起来”走向“真正可持续使用”的这一轮收口方向。",
  tags: ["workspace", "product", "build-in-public"],
  title: "让 SunnyPanel 成为一个真正可持续的个人面板",
};

const starterChecklistSeed = {
  groups: [
    {
      items: [
        {
          completionNote: "公开层已经具备基础说明页，可以直接承接访客视角。",
          description: "确认 About 和 Now 已经有能直接公开展示的内容。",
          isCompleted: true,
          title: "补齐 About / Now 页面",
        },
        {
          description: "让首页除了清单和动态之外，也能展示阶段叙事入口。",
          isCompleted: true,
          title: "把时间线入口放回首页",
        },
      ],
      title: "公开表达层",
    },
    {
      items: [
        {
          description: "让第一次进入后台就能看到计划、内容和引导，而不是完全空白。",
          isCompleted: true,
          title: "准备默认工作区内容",
        },
        {
          description: "继续检查移动端、详情页和 Dashboard 的细节表现。",
          isCompleted: false,
          title: "继续做体验收尾",
        },
      ],
      title: "工作流收尾",
    },
  ],
  publishedAt: samplePublishedAt,
  slug: "sunnypanel-launch-checklist",
  summary: "这份清单用来承接 SunnyPanel 当前这一轮公开层与工作区收口任务。",
  title: "SunnyPanel 当前收尾清单",
};

const starterUpdates = [
  {
    content: "把首页从纯双栏内容流调整成“清单 + 动态 + 精选时间线”的组合后，公开层终于更像一个可以停留和浏览的入口了。",
    type: "project",
  },
  {
    content: "工作台现在不仅能看计划，还能看到 onboarding、最近编辑内容和更明确的下一步提示，第一次进入时不再那么空。",
    type: "work",
  },
  {
    content: "这轮整理的目标很明确：让 SunnyPanel 从“功能都在”进入“默认就能用”的状态，减少每次新环境都要手动补内容的成本。",
    type: "life",
  },
] as const;

const starterNotes = [
  {
    category: "idea",
    content: "如果 SunnyPanel 未来要接全自动 Agent，它首先不能只是会生成文字，而要能读懂 Plan、Update、Checklist、Timeline 这些结构化上下文，并在此基础上判断下一步。",
    mood: "在收口，也在铺路",
    pinned: true,
  },
  {
    category: "workflow",
    content: "真正值得做的不是一个会聊天的 Agent，而是一个能持续整理上下文、推进计划、回写结果、保留审计痕迹的长期工作流。",
    mood: "清晰",
    pinned: false,
  },
] as const;

const starterPlans = [
  {
    description: "继续打磨首页、文章页和 Page 页的阅读体验，让默认内容之外的真实内容也更容易承接。",
    dueDate: "2026-05-02T10:00:00.000Z",
    priority: "high" as const,
    state: "active" as const,
    status: "published" as const,
    title: "继续完善公开层阅读体验",
  },
  {
    description: "检查 Dashboard 的指标、队列和创建入口是否足够支撑日常使用，再决定要不要补更多运营视角信息。",
    dueDate: "2026-05-06T10:00:00.000Z",
    priority: "medium" as const,
    state: "backlog" as const,
    status: "draft" as const,
    title: "补一轮工作台运营视角",
  },
  {
    description: "等公开层与工作台体验稳定后，再推进部署、环境变量和整栈验收。",
    dueDate: "2026-05-10T10:00:00.000Z",
    priority: "medium" as const,
    state: "backlog" as const,
    status: "draft" as const,
    title: "准备部署与验收收尾",
  },
  {
    description: "先补齐内容、上下文和可追踪的执行骨架，再决定 Agent 的记忆、检索、执行与审计怎么接入。",
    dueDate: "2026-05-14T10:00:00.000Z",
    priority: "high" as const,
    state: "backlog" as const,
    status: "draft" as const,
    title: "为全自动 Agent 工作流补齐基础上下文",
  },
] as const;

type SeedableCollection = "agent-runs" | "checklists" | "notes" | "pages" | "posts" | "timeline-events" | "updates";

const findFirstByWhere = async <TDocument>(
  payload: Payload,
  collection: SeedableCollection,
  where: Where,
) => {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where,
  });

  return (result.docs[0] ?? null) as null | TDocument;
};

export const hasInitialWorkspaceSeed = async (payload: Payload) => {
  const agentFoundationPlan = await payload.find({
    collection: "plans",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      title: {
        equals: "为全自动 Agent 工作流补齐基础上下文",
      },
    },
  });

  return Boolean(agentFoundationPlan.docs[0]);
};

export const ensureInitialWorkspace = async (payload: Payload, user: User) => {
  const [aboutPage, nowPage, starterPost, starterChecklist] = await Promise.all([
    findFirstByWhere<{ id: number }>(payload, "pages", {
      slug: {
        equals: aboutPageSeed.slug,
      },
    }),
    findFirstByWhere<{ id: number }>(payload, "pages", {
      slug: {
        equals: nowPageSeed.slug,
      },
    }),
    findFirstByWhere<{ id: number }>(payload, "posts", {
      slug: {
        equals: starterPostSeed.slug,
      },
    }),
    findFirstByWhere<{ id: number }>(payload, "checklists", {
      slug: {
        equals: starterChecklistSeed.slug,
      },
    }),
  ]);

  const aboutPageDoc =
    aboutPage ??
    ((await payload.create({
      collection: "pages",
      data: {
        ...aboutPageSeed,
        status: "published",
        visibility: "public",
      },
      overrideAccess: true,
    })) as { id: number });

  const nowPageDoc =
    nowPage ??
    ((await payload.create({
      collection: "pages",
      data: {
        ...nowPageSeed,
        status: "published",
        visibility: "public",
      },
      overrideAccess: true,
    })) as { id: number });

  const starterPostDoc =
    starterPost ??
    ((await payload.create({
      collection: "posts",
      data: {
        ...starterPostSeed,
        status: "published",
        visibility: "public",
      },
      overrideAccess: true,
    })) as { id: number });

  const starterChecklistDoc =
    starterChecklist ??
    ((await payload.create({
      collection: "checklists",
      context: {
        skipChecklistTimelineSync: true,
      },
      data: {
        ...starterChecklistSeed,
        status: "published",
        visibility: "public",
      },
      overrideAccess: true,
    })) as { id: number });

  const starterUpdateDocs = await Promise.all(
    starterUpdates.map(async (update) => {
      const existingUpdate = await findFirstByWhere<{ id: number }>(payload, "updates", {
        content: {
          equals: update.content,
        },
      });

      if (existingUpdate) {
        return existingUpdate;
      }

      return (await payload.create({
        collection: "updates",
        data: {
          ...update,
          status: "published",
          visibility: "public",
        },
        overrideAccess: true,
      })) as { id: number };
    }),
  );

  const starterNoteDocs = await Promise.all(
    starterNotes.map(async (note) => {
      const existingNote = await findFirstByWhere<{ id: number }>(payload, "notes", {
        content: {
          equals: note.content,
        },
      });

      if (existingNote) {
        return existingNote;
      }

      return (await payload.create({
        collection: "notes",
        data: {
          ...note,
          status: "published",
          visibility: "public",
        },
        overrideAccess: true,
      })) as { id: number };
    }),
  );

  const timelineSeeds = [
    {
      description: "公开首页现在不再只承接最近内容，也开始直接暴露阶段性叙事入口。",
      eventDate: "2026-04-23T09:00:00.000Z",
      isFeatured: true,
      relatedPost: starterPostDoc.id,
      title: "首页补上精选时间线入口",
      type: "milestone" as const,
    },
    {
      description: "用连续的 Update 把最近这轮推进串起来，公开层不再只剩孤立页面。",
      eventDate: "2026-04-22T09:00:00.000Z",
      isFeatured: true,
      relatedUpdate: starterUpdateDocs[0]?.id,
      title: "公开动态流开始承接最近推进变化",
      type: "project" as const,
    },
    {
      description: `以 ${user.displayName || user.email} 的默认工作区为起点，把“能跑起来”推进到“默认就能用”。`,
      eventDate: "2026-04-21T09:00:00.000Z",
      isFeatured: false,
      relatedChecklist: starterChecklistDoc.id,
      title: "默认工作区内容闭环已经补齐",
      type: "project" as const,
    },
  ];

  await Promise.all(
    timelineSeeds.map(async (event) => {
      const existingEvent = await findFirstByWhere<{ id: number }>(payload, "timeline-events", {
        title: {
          equals: event.title,
        },
      });

      if (existingEvent) {
        return existingEvent;
      }

      return payload.create({
        collection: "timeline-events",
        data: {
          ...event,
          sortOrder: event.isFeatured ? 10 : 0,
          status: "published",
          visibility: "public",
        },
        overrideAccess: true,
      });
    }),
  );

  const starterPlanDocs = await Promise.all(
    starterPlans.map(async (plan, index) => {
      const existingPlan = await payload.find({
        collection: "plans",
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: {
          title: {
            equals: plan.title,
          },
        },
      });

      let linkedContent: NonNullable<Plan["linkedContent"]> = [];
      let executionMode: NonNullable<Plan["executionMode"]> = "manual";
      let agentState: NonNullable<Plan["agentState"]> = "idle";
      let agentBrief: string | undefined;

      if (index === 0) {
        linkedContent = [
          {
            relationTo: "pages",
            value: aboutPageDoc.id,
          },
          {
            relationTo: "pages",
            value: nowPageDoc.id,
          },
          {
            relationTo: "posts",
            value: starterPostDoc.id,
          },
        ];
        executionMode = "hybrid";
        agentBrief = "Agent 可以辅助检查页面文案、结构一致性和公开层缺口，但最终发布判断由人工确认。";
      } else if (index === 1 && starterUpdateDocs[0]?.id) {
        linkedContent = [
          {
            relationTo: "updates",
            value: starterUpdateDocs[0].id,
          },
        ];
        executionMode = "hybrid";
        agentBrief = "Agent 可以整理工作台统计、指出缺口并建议优先级，但不要直接改动公开内容。";
      } else if (index === 2) {
        linkedContent = [
          {
            relationTo: "checklists",
            value: starterChecklistDoc.id,
          },
        ];
        executionMode = "manual";
      } else if (index === 3) {
        const noteId = starterNoteDocs[0]?.id ?? starterNoteDocs[1]?.id;

        if (noteId) {
          linkedContent.push({
            relationTo: "notes",
            value: noteId,
          });
        }

        linkedContent.push({
          relationTo: "posts",
          value: starterPostDoc.id,
        });

        executionMode = "agent";
        agentState = "ready";
        agentBrief =
          "目标是补齐全自动 Agent 工作流的基础上下文、执行日志、状态流转和审计入口。Agent 可以创建或更新私有执行记录，但公开发布仍需人工复核。";
      }

      const planData = {
        ...plan,
        agentBrief,
        agentState,
        executionMode,
        linkedContent,
        startDate: samplePublishedAt,
        visibility: "private" as const,
      };

      if (existingPlan.docs[0]) {
        const currentPlan = existingPlan.docs[0];
        const planPatch: Record<string, unknown> = {};

        if (!currentPlan.description) {
          planPatch.description = planData.description;
        }

        if (!currentPlan.dueDate) {
          planPatch.dueDate = planData.dueDate;
        }

        if (!currentPlan.priority) {
          planPatch.priority = planData.priority;
        }

        if (!currentPlan.state) {
          planPatch.state = planData.state;
        }

        if (!currentPlan.status) {
          planPatch.status = planData.status;
        }

        if (!currentPlan.startDate) {
          planPatch.startDate = planData.startDate;
        }

        if (!currentPlan.visibility) {
          planPatch.visibility = planData.visibility;
        }

        if (!currentPlan.executionMode) {
          planPatch.executionMode = planData.executionMode;
        }

        if (!currentPlan.agentState && planData.agentState !== "idle") {
          planPatch.agentState = planData.agentState;
        }

        if (planData.agentBrief && !currentPlan.agentBrief) {
          planPatch.agentBrief = planData.agentBrief;
        }

        if (
          linkedContent.length > 0 &&
          (!Array.isArray(currentPlan.linkedContent) || currentPlan.linkedContent.length === 0)
        ) {
          planPatch.linkedContent = linkedContent;
        }

        if (Object.keys(planPatch).length === 0) {
          return currentPlan;
        }

        return payload.update({
          collection: "plans",
          data: planPatch,
          id: currentPlan.id,
          overrideAccess: true,
        });
      }

      return payload.create({
        collection: "plans",
        data: planData,
        overrideAccess: true,
      });
    }),
  );

  const agentFoundationPlan = starterPlanDocs.find((plan) => plan.title === "为全自动 Agent 工作流补齐基础上下文");

  if (agentFoundationPlan) {
    const existingAgentRun = await findFirstByWhere<Pick<
      AgentRun,
      "completedAt" | "goal" | "id" | "nextAction" | "relatedPlan" | "startedAt" | "status" | "steps" | "summary"
    >>(payload, "agent-runs", {
      title: {
        equals: "Agent readiness audit baseline",
      },
    });

    const agentRunData = {
      completedAt: "2026-04-23T09:05:00.000Z",
      durationMs: 300000,
      goal: "确认当前工作区是否已经具备公开内容、计划结构、执行状态和日志入口这四类 Agent 前置基础。",
      nextAction: "下一步开始设计 Agent memory、scheduler、tool execution boundary 和人工复核节点。",
      relatedContent: [
        {
          relationTo: "posts" as const,
          value: starterPostDoc.id,
        },
        {
          relationTo: "notes" as const,
          value: starterNoteDocs[0]?.id ?? starterNoteDocs[1]?.id,
        },
        {
          relationTo: "pages" as const,
          value: aboutPageDoc.id,
        },
      ].filter((item) => item.value),
      relatedPlan: agentFoundationPlan.id,
      startedAt: samplePublishedAt,
      status: "succeeded" as const,
      steps: [
        {
          level: "info" as const,
          message: "检查 About / Now、Post、Update、Checklist、Timeline 是否已具备默认内容。",
          recordedAt: samplePublishedAt,
        },
        {
          level: "info" as const,
          message: "检查工作台是否能看到计划、内容队列和后续 Agent 运行入口。",
          recordedAt: "2026-04-23T08:34:00.000Z",
        },
        {
          level: "info" as const,
          message: "确认需要继续补齐执行日志、状态流转和审计结构，作为下一阶段前置。",
          recordedAt: "2026-04-23T09:05:00.000Z",
        },
      ],
      summary: "默认内容闭环已经就位，Agent 前置工作需要继续补齐计划执行状态、运行日志和工作台视图。",
      title: "Agent readiness audit baseline",
      trigger: "manual" as const,
      workflow: "readiness-audit" as const,
    };

    if (existingAgentRun) {
      const agentRunPatch: Record<string, unknown> = {};

      if (!existingAgentRun.relatedPlan) {
        agentRunPatch.relatedPlan = agentFoundationPlan.id;
      }

      if (!existingAgentRun.goal) {
        agentRunPatch.goal = agentRunData.goal;
      }

      if (!existingAgentRun.summary) {
        agentRunPatch.summary = agentRunData.summary;
      }

      if (!existingAgentRun.nextAction) {
        agentRunPatch.nextAction = agentRunData.nextAction;
      }

      if (!existingAgentRun.status) {
        agentRunPatch.status = agentRunData.status;
      }

      if (!existingAgentRun.startedAt) {
        agentRunPatch.startedAt = agentRunData.startedAt;
      }

      if (!existingAgentRun.completedAt) {
        agentRunPatch.completedAt = agentRunData.completedAt;
      }

      if (!Array.isArray(existingAgentRun.steps) || existingAgentRun.steps.length === 0) {
        agentRunPatch.steps = agentRunData.steps;
      }

      if (Object.keys(agentRunPatch).length === 0) {
        return;
      }

      await payload.update({
        collection: "agent-runs",
        data: agentRunPatch,
        id: existingAgentRun.id,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: "agent-runs",
        data: agentRunData,
        overrideAccess: true,
      });
    }
  }
};

type BuildOnboardingChecklistArgs = {
  activePlans: number;
  agentRuns: number;
  agentReadyPlans: number;
  publicContentItems: number;
  publicPages: number;
  timelineEvents: number;
};

export const buildOnboardingChecklist = ({
  activePlans,
  agentRuns,
  agentReadyPlans,
  publicContentItems,
  publicPages,
  timelineEvents,
}: BuildOnboardingChecklistArgs) => {
  const tasks = [
    {
      title: "个性化 About / Now",
      description: "默认内容已经就位，下一步把两页改成你自己的语气和信息密度。",
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
      title: "确认公开内容主线",
      description: "默认内容会自动补齐，但你最好尽快替换成真正属于自己的第一批公开内容。",
      href: "/admin",
      done: publicContentItems > 0,
    },
    {
      title: "继续扩展 Timeline",
      description: "默认工作区已经带入基础节点，后续再把真正重要的阶段变化写进去。",
      href: "/admin/collections/timeline-events",
      done: timelineEvents > 0,
    },
    {
      title: "定义第一条 Agent 执行链路",
      description: "至少保留一条可执行计划和一条运行记录，后面接自动 Agent 时才不会从空白开始。",
      href: "/admin/collections/agent-runs",
      done: agentReadyPlans > 0 && agentRuns > 0,
    },
  ];

  return {
    completed: tasks.filter((task) => task.done).length,
    tasks,
    total: tasks.length,
  };
};
