import type { Plan } from "@/payload-types";

import type { WorkspaceSnapshot } from "@/lib/payload/workspace";

export type AgentQuickPrompt = {
  label: string;
  prompt: string;
};

const maxQuickPrompts = 5;

const fallbackQuickPrompts: AgentQuickPrompt[] = [
  {
    label: "今日动作",
    prompt: "整理今天最应该推进的一个动作",
  },
  {
    label: "本周回顾",
    prompt: "生成本周计划回顾",
  },
  {
    label: "查进度",
    prompt: "查一下整体进度",
  },
  {
    label: "评估计划",
    prompt: "评估整体计划",
  },
  {
    label: "公开更新",
    prompt: "把最近公开内容整理成一条 Update",
  },
];

const quote = (value: string) => `「${value}」`;

const isOverduePlan = (plan: Plan, now: Date) => {
  if (plan.state === "done" || !plan.dueDate) {
    return false;
  }

  const dueDate = new Date(plan.dueDate);
  const todayStart = new Date(now);

  todayStart.setHours(0, 0, 0, 0);

  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  return dueDate.getTime() < todayStart.getTime();
};

const pushUniquePrompt = (prompts: AgentQuickPrompt[], nextPrompt: AgentQuickPrompt) => {
  if (prompts.some((item) => item.prompt === nextPrompt.prompt)) {
    return;
  }

  prompts.push(nextPrompt);
};

export const buildAgentQuickPrompts = (snapshot: WorkspaceSnapshot): AgentQuickPrompt[] => {
  const prompts: AgentQuickPrompt[] = [];
  const now = new Date();
  const overduePlans = [
    ...snapshot.plans.active,
    ...snapshot.plans.backlog,
    ...snapshot.plans.paused,
  ].filter((plan) => isOverduePlan(plan, now));
  const activePlan = snapshot.plans.active[0];
  const overduePlan = overduePlans[0];
  const recentDraft = snapshot.execution.recentDrafts[0];
  const timelineCandidate = snapshot.execution.timelineCandidates[0];
  const privateReadyContent = snapshot.execution.recentPrivateReady[0];
  const publicContent = snapshot.execution.recentPublicContent[0];
  const pendingOnboardingTask = snapshot.onboarding.tasks.find((task) => !task.done);

  if (overduePlan) {
    pushUniquePrompt(prompts, {
      label: "逾期风险",
      prompt: `评估${quote(overduePlan.title)}的逾期风险，并整理下一步止损动作`,
    });
  }

  if (activePlan) {
    pushUniquePrompt(prompts, {
      label: "推进风险",
      prompt: `评估${quote(activePlan.title)}的推进风险`,
    });
  }

  if (timelineCandidate) {
    pushUniquePrompt(prompts, {
      label: "补时间线",
      prompt: `帮我给${quote(timelineCandidate.title)}补一个 Timeline 节点`,
    });
  }

  if (recentDraft) {
    pushUniquePrompt(prompts, {
      label: "整理草稿",
      prompt: `整理${quote(recentDraft.title)}从草稿到发布的下一步`,
    });
  }

  if (privateReadyContent) {
    pushUniquePrompt(prompts, {
      label: "发布检查",
      prompt: `检查${quote(privateReadyContent.title)}是否适合公开发布`,
    });
  }

  if (publicContent) {
    pushUniquePrompt(prompts, {
      label: "公开更新",
      prompt: `把最近公开内容整理成一条 Update，重点参考${quote(publicContent.title)}`,
    });
  }

  if (pendingOnboardingTask) {
    pushUniquePrompt(prompts, {
      label: "基础补齐",
      prompt: `帮我完成${quote(pendingOnboardingTask.title)}的下一步`,
    });
  }

  if (snapshot.plans.active.length > 0 || snapshot.plans.backlog.length > 0) {
    pushUniquePrompt(prompts, {
      label: "今日动作",
      prompt: "整理今天最应该推进的一个动作",
    });
  }

  if (snapshot.counts.plans > 0) {
    pushUniquePrompt(prompts, {
      label: "本周回顾",
      prompt: "生成本周计划回顾",
    });
  }

  return prompts.length > 0 ? prompts.slice(0, maxQuickPrompts) : fallbackQuickPrompts;
};
