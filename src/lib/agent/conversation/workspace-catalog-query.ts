import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";

const normalize = (value: string): string =>
  value.replace(/\s+/g, "").toLowerCase();

const hasMutationLanguage = (message: string): boolean =>
  /(创建|新建|生成|制定|添加|追加|记录|修改|更新|删除|取消|保存|安排|排期)/.test(
    message,
  );

const hasCatalogLanguage = (message: string): boolean =>
  /(有哪些|有什么|都有什么|列出|列一下|列一列|现有的?|当前的?|可选的?|分别是|给我看看)/.test(
    message,
  );

const planStateLabels: Record<string, string> = {
  active: "进行中",
  backlog: "待开始",
  completed: "已完成",
  paused: "已暂停",
};

const checklistStatusLabels: Record<string, string> = {
  archived: "已归档",
  completed: "已完成",
  draft: "草稿",
  in_progress: "进行中",
  published: "已发布",
};

export type WorkspaceCatalogScope = Readonly<{
  checklists: boolean;
  plans: boolean;
}>;

export const detectWorkspaceCatalogScope = (
  input: string,
): WorkspaceCatalogScope | null => {
  const message = normalize(input);

  if (
    !hasCatalogLanguage(message)
    || hasMutationLanguage(message)
    || /(进度|完成度|完成情况|评估)/.test(message)
  ) {
    return null;
  }

  const plans = message.includes("计划");
  const checklists =
    message.includes("清单")
    || message.includes("任务列表")
    || message.includes("todo");

  return plans || checklists ? { checklists, plans } : null;
};

const formatPlans = (context: AgentPromptContext): string => {
  if (context.plans.length === 0) {
    return "当前没有可见计划。";
  }

  const items = context.plans.map((plan, index) => {
    const status = planStateLabels[plan.state] ?? plan.state ?? "状态未知";
    return `${index + 1}. ${plan.title}（${status}）`;
  });

  return `当前可见计划（${context.plans.length}）：\n${items.join("\n")}`;
};

const formatChecklists = (context: AgentPromptContext): string => {
  if (context.checklists.length === 0) {
    return "当前没有可见清单。";
  }

  const items = context.checklists.map((checklist, index) => {
    const progress =
      typeof checklist.completedItems === "number"
      && typeof checklist.totalItems === "number"
        ? `，${checklist.completedItems}/${checklist.totalItems} 已完成`
        : "";
    const status = checklist.status
      ? `，${checklistStatusLabels[checklist.status] ?? checklist.status}`
      : "";

    return `${index + 1}. ${checklist.title}${progress}${status}`;
  });

  return `当前可见清单（${context.checklists.length}）：\n${items.join("\n")}`;
};

export const buildWorkspaceCatalogAnswer = (
  context: AgentPromptContext,
  scope: WorkspaceCatalogScope,
): string => {
  const sections = [
    scope.plans ? formatPlans(context) : null,
    scope.checklists ? formatChecklists(context) : null,
  ].filter((section): section is string => Boolean(section));

  return [
    ...sections,
    "你可以直接回复计划或清单名称，我会接着处理。",
  ].join("\n\n");
};

export const resolveWorkspaceCatalogIntent = (
  message: string,
  context: AgentPromptContext,
): AgentIntent | null => {
  const scope = detectWorkspaceCatalogScope(message);

  if (!scope) {
    return null;
  }

  return {
    args: {
      answer: buildWorkspaceCatalogAnswer(context, scope),
      learningContext: null,
      openDomainTopic: null,
      suggestAction: "直接回复计划或清单名称继续。",
    },
    confidence: 1,
    intent: "answer_question",
  };
};
