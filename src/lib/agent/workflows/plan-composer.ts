import type { PlanPriorityValue, PlanProposal, ComposePlanArgs } from "../schemas";

import { normalizeComposePlanArgs, parsePlanSeedFromText } from "./plan-seed";

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
  const normalized = normalizeComposePlanArgs(args);

  return compactText(normalized.title || "新的执行计划", 48);
};

const inferGoal = (args: ComposePlanArgs, title: string) => {
  const normalized = normalizeComposePlanArgs(args);
  const explicitGoal = normalizeText(normalized.goal);

  if (explicitGoal && explicitGoal.length <= 160 && !/请你|为我规划|学习方案/.test(explicitGoal)) {
    return explicitGoal;
  }

  const seed = parsePlanSeedFromText(normalized.sourceText || "");

  return seed.goal || `把「${title}」推进到可验证的完成状态。`;
};

const defaultKeySteps = () => [
  "明确本阶段要完成的章节或交付物",
  "完成当日练习与错题记录",
  "周末做一次阶段复盘",
];

const defaultNextActions = (title: string) => [
  `今天先确认「${title}」的第一周任务清单`,
  "把第一天任务安排进日程",
  "完成后补一条进展记录",
];

const defaultSuccessCriteria = (title: string) => [
  `「${title}」各阶段有明确章节/任务覆盖`,
  "每周至少完成一轮练习与复盘",
  "到期前完成模拟或综合检测",
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
  const normalized = normalizeComposePlanArgs(args);
  const parsed = parsePlanSeedFromText(normalized.sourceText || normalized.goal || "");

  if (parsed.topic || parsed.durationDays || parsed.startDate) {
    return false;
  }

  const seed = cleanPlanSeed(
    [normalized.title, normalized.goal, normalized.sourceText]
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(" "),
  );

  return seed.length < 4 || /^(计划|制定计划|规划|帮我规划|帮我制定计划)$/.test(seed);
};

export const composePlanProposal = (args: ComposePlanArgs): PlanProposal => {
  if (args.proposal) {
    return args.proposal;
  }

  const normalized = normalizeComposePlanArgs(args);
  const title = inferTitle(normalized);
  const goal = inferGoal(normalized, title);
  const seed = parsePlanSeedFromText(normalized.sourceText || "");
  const partialProposal = {
    goal,
    keySteps: uniqueList(toList(normalized.keySteps)).length > 0 ? uniqueList(toList(normalized.keySteps)) : defaultKeySteps(),
    motivation:
      normalizeText(normalized.motivation) ||
      (seed.startDate ? `从 ${seed.startDate} 开始执行，按阶段推进。` : "按阶段拆解后逐步执行。"),
    nextActions:
      uniqueList(toList(normalized.nextActions)).length > 0
        ? uniqueList(toList(normalized.nextActions))
        : defaultNextActions(title),
    outOfScope: normalizeText(normalized.outOfScope) || "暂不扩展到与当前目标无关的新主题或长期维护工作。",
    risks: uniqueList(toList(normalized.risks)).length > 0 ? uniqueList(toList(normalized.risks)) : defaultRisks(),
    scope:
      normalizeText(normalized.scope) ||
      (seed.dailyPace ? `按「${seed.dailyPace}」推进，覆盖教材章节与练习。` : "聚焦近期能推进的章节、练习与复盘。"),
    successCriteria:
      uniqueList(toList(normalized.successCriteria)).length > 0
        ? uniqueList(toList(normalized.successCriteria))
        : defaultSuccessCriteria(title),
    suggestedDueDate: validDueDate(normalized.suggestedDueDate ?? seed.dueDate),
    suggestedPriority: normalized.suggestedPriority ?? inferPriority(goal),
    title,
  } satisfies Omit<PlanProposal, "agentBrief">;

  return {
    ...partialProposal,
    agentBrief: normalizeText(args.agentBrief) || buildAgentBrief(partialProposal),
  };
};

import type { DecomposedPlan } from "./plan-decomposer";

export const composePlanProposalFromDecomposed = (
  args: ComposePlanArgs,
  decomposed: DecomposedPlan,
): PlanProposal => {
  const normalized = normalizeComposePlanArgs(args);
  const title = inferTitle(normalized);
  const seed = parsePlanSeedFromText(normalized.sourceText || "");
  const keySteps = decomposed.phases.map(
    (phase) =>
      `【${phase.title}】(${phase.estimatedDays}天) ${phase.goal}`,
  );
  const firstPhase = decomposed.phases[0];
  const nextActions = firstPhase
    ? firstPhase.milestones.flatMap((m) =>
        m.tasks.slice(0, 2).map((t) => `[${firstPhase.title}] ${t}`),
      )
    : [];

  const allTasks = decomposed.phases.flatMap((p) =>
    p.milestones.flatMap((m) => m.tasks),
  );

  const suggestDueDate = (estimatedDays: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + estimatedDays);
    return date.toISOString().split("T")[0];
  };

  return {
    title,
    goal: decomposed.finalGoal || inferGoal(normalized, title),
    motivation:
      normalizeText(normalized.motivation) ||
      (seed.startDate
        ? `从 ${seed.startDate} 起，分 ${decomposed.phases.length} 个阶段推进。`
        : `分 ${decomposed.phases.length} 个阶段系统推进。`),
    scope:
      normalizeText(normalized.scope) ||
      `覆盖 ${decomposed.phases.length} 个阶段，共 ${allTasks.length} 项任务，预计 ${decomposed.totalEstimatedDays} 天。`,
    outOfScope: normalizeText(normalized.outOfScope) || "暂不扩展到与当前目标无关的新主题。",
    keySteps,
    nextActions: nextActions.slice(0, 8),
    successCriteria: [
      `完成全部 ${decomposed.phases.length} 个阶段的关键里程碑`,
      "每个阶段的产出有记录或验证",
      `最终达成: ${decomposed.finalGoal}`,
    ],
    risks: [
      "阶段时间估算可能与实际推进速度有偏差",
      "缺少固定执行时间，容易被其他任务挤掉",
    ],
    suggestedDueDate:
      validDueDate(normalized.suggestedDueDate ?? seed.dueDate) ??
      suggestDueDate(decomposed.totalEstimatedDays),
    suggestedPriority: normalized.suggestedPriority ?? inferPriority(title),
    agentBrief:
      decomposed.phases
        .map(
          (p, i) =>
            `阶段${i + 1}「${p.title}」(${p.estimatedDays}天): ${p.goal}\n` +
            p.milestones
              .map((m) => `  · ${m.title}: ${m.tasks.join("、")}`)
              .join("\n"),
        )
        .join("\n\n") +
      `\n\n学习节奏: ${decomposed.weeklyRhythm}`,
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
