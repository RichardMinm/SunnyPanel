import type { PlanPriorityValue, PlanProposal, ComposePlanArgs } from "../schemas";

const fallbackPriority: PlanPriorityValue = "medium";

const normalizeText = (value: null | string | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";

const compactText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`;

const cleanPlanSeed = (value: string) =>
  normalizeText(value)
    .replace(/^(帮我|请|麻烦你)?(制定|规划|创建|生成|做)(一个)?(完整)?计划[:：，,\s]*/g, "")
    .replace(/^(关于|围绕|为了)/, "")
    .replace(/[。！!？?]+$/g, "");

const toList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => normalizeText(typeof item === "string" ? item : null))
        .filter(Boolean)
        .slice(0, 8)
    : [];

const uniqueList = (items: string[]) => [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))];

const inferPriority = (text: string): PlanPriorityValue => {
  if (/(紧急|重要|高优先|本周|今天|明天|截止|ddl|deadline)/i.test(text)) {
    return "high";
  }

  if (/(有空|低优先|以后| someday |不急)/i.test(text)) {
    return "low";
  }

  return fallbackPriority;
};

const validDueDate = (value: null | string | undefined) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
};

const inferTitle = (args: ComposePlanArgs) => {
  const explicitTitle = normalizeText(args.title);

  if (explicitTitle) {
    return compactText(explicitTitle, 72);
  }

  const seed = cleanPlanSeed(normalizeText(args.goal) || normalizeText(args.sourceText));

  if (!seed) {
    return "新的执行计划";
  }

  return compactText(seed.replace(/^(我要|我想|想要|需要)/, ""), 72);
};

const inferGoal = (args: ComposePlanArgs, title: string) => {
  const explicitGoal = normalizeText(args.goal);

  if (explicitGoal) {
    return explicitGoal;
  }

  const source = cleanPlanSeed(normalizeText(args.sourceText));

  return source || `把「${title}」推进到可验证的完成状态。`;
};

const defaultKeySteps = (title: string) => [
  `明确「${title}」的完成定义和必要输入`,
  "拆出可在 1 到 2 天内推进的最小行动",
  "完成核心产出并记录阻塞点",
  "复盘结果，补充后续行动或 Timeline 记忆",
];

const defaultNextActions = (title: string) => [
  `今天先整理「${title}」的目标、材料和限制`,
  "选出最小可执行步骤并安排到最近一个工作块",
  "完成后补一条进展记录，方便后续 Agent 接续",
];

const defaultSuccessCriteria = (title: string) => [
  `「${title}」有明确产出或完成记录`,
  "关键步骤至少完成一轮闭环",
  "下一步、风险和复盘信息已经沉淀到计划中",
];

const defaultRisks = () => [
  "目标范围继续扩张，导致计划停留在准备阶段",
  "缺少固定执行时间，后续容易被其他任务挤掉",
];

const buildAgentBrief = (proposal: Omit<PlanProposal, "agentBrief">) =>
  [
    `目标：${proposal.goal}`,
    `范围：${proposal.scope || "围绕当前目标完成必要准备、执行和复盘。"}`,
    proposal.outOfScope ? `不做：${proposal.outOfScope}` : null,
    `关键步骤：${proposal.keySteps.join("；")}`,
    `下一步：${proposal.nextActions.join("；")}`,
    `验收标准：${proposal.successCriteria.join("；")}`,
    proposal.risks.length > 0 ? `风险：${proposal.risks.join("；")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

export const isPlanComposerInputAmbiguous = (args: ComposePlanArgs) => {
  const seed = cleanPlanSeed(
    [
      args.title,
      args.goal,
      args.sourceText,
      args.motivation,
      args.scope,
    ]
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(" "),
  );

  return seed.length < 6 || /^(计划|制定计划|规划|帮我规划|帮我制定计划)$/.test(seed);
};

export const composePlanProposal = (args: ComposePlanArgs): PlanProposal => {
  if (args.proposal) {
    return args.proposal;
  }

  const title = inferTitle(args);
  const goal = inferGoal(args, title);
  const seed = [title, goal, args.sourceText].map((item) => normalizeText(item)).join(" ");
  const partialProposal = {
    goal,
    keySteps: uniqueList(toList(args.keySteps)).length > 0 ? uniqueList(toList(args.keySteps)) : defaultKeySteps(title),
    motivation:
      normalizeText(args.motivation) || `把「${title}」从一句想法变成可以执行、可以复盘的行动路径。`,
    nextActions:
      uniqueList(toList(args.nextActions)).length > 0 ? uniqueList(toList(args.nextActions)) : defaultNextActions(title),
    outOfScope: normalizeText(args.outOfScope) || "暂不扩展到与当前目标无关的新主题或长期维护工作。",
    risks: uniqueList(toList(args.risks)).length > 0 ? uniqueList(toList(args.risks)) : defaultRisks(),
    scope: normalizeText(args.scope) || "聚焦近期能推进的关键动作、必要产出和复盘记录。",
    successCriteria:
      uniqueList(toList(args.successCriteria)).length > 0
        ? uniqueList(toList(args.successCriteria))
        : defaultSuccessCriteria(title),
    suggestedDueDate: validDueDate(args.suggestedDueDate),
    suggestedPriority: args.suggestedPriority ?? inferPriority(seed),
    title,
  } satisfies Omit<PlanProposal, "agentBrief">;

  return {
    ...partialProposal,
    agentBrief: normalizeText(args.agentBrief) || buildAgentBrief(partialProposal),
  };
};

export const formatPlanProposalDescription = (proposal: PlanProposal) =>
  [
    `目标：${proposal.goal}`,
    proposal.motivation ? `\n动机：${proposal.motivation}` : null,
    proposal.scope ? `\n范围：${proposal.scope}` : null,
    proposal.outOfScope ? `\n不在范围：${proposal.outOfScope}` : null,
    "\n关键步骤：",
    ...proposal.keySteps.map((item, index) => `${index + 1}. ${item}`),
    "\n下一步行动：",
    ...proposal.nextActions.map((item, index) => `${index + 1}. ${item}`),
    "\n验收标准：",
    ...proposal.successCriteria.map((item, index) => `${index + 1}. ${item}`),
    proposal.risks.length > 0 ? "\n风险 / 阻塞：" : null,
    ...proposal.risks.map((item, index) => `${index + 1}. ${item}`),
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .join("\n");
