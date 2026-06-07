import type { ComposePlanArgs } from "../schemas";

import type { DecomposedPlan, DecomposedPhase } from "./plan-decomposer";
import { fetchWithRetry, getAgentModelConfig } from "../client";

export type ParsedPlanSeed = {
  dailyPace: string | null;
  dueDate: string | null;
  durationDays: number | null;
  goal: string;
  sourceText: string;
  startDate: string | null;
  title: string;
  topic: string | null;
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const pad2 = (value: number) => String(value).padStart(2, "0");

const toIsoDate = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const dateToIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const WEEKDAY_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

export const parseDateFromText = (text: string, reference = new Date()): string | null => {
  const normalized = text.replace(/\s+/g, "");

  const refYear = reference.getFullYear();
  const refMonth = reference.getMonth();
  const refDate = reference.getDate();
  const refDay = reference.getDay();

  const relativePatterns: Array<[RegExp, () => Date]> = [
    [/大后天/, () => addDays(reference, 3)],
    [/后天/, () => addDays(reference, 2)],
    [/明天|明日/, () => addDays(reference, 1)],
    [/今天|今日/, () => new Date(reference)],
  ];
  for (const [pattern, resolver] of relativePatterns) {
    if (pattern.test(normalized)) return dateToIsoDate(resolver());
  }

  const nextWeekdayMatch = normalized.match(/下周([一二三四五六日天])/);
  if (nextWeekdayMatch) {
    const targetDay = WEEKDAY_MAP[nextWeekdayMatch[1]];
    const diff = (targetDay + 7 - refDay) % 7 || 7;
    return dateToIsoDate(addDays(reference, diff));
  }

  if (/下周(?!\d)/.test(normalized)) return dateToIsoDate(addDays(reference, 7));

  const thisWeekdayMatch = normalized.match(/本周([一二三四五六日天])/);
  if (thisWeekdayMatch) {
    const targetDay = WEEKDAY_MAP[thisWeekdayMatch[1]];
    const diff = (targetDay + 7 - refDay) % 7;
    return dateToIsoDate(addDays(reference, diff));
  }

  const nextMonthMatch = normalized.match(/下个?月/);
  if (nextMonthMatch) {
    const nextMonth = refMonth + 1;
    const year = refYear + (nextMonth > 11 ? 1 : 0);
    const month = nextMonth % 12;
    const day = Math.min(refDate, lastDayOfMonth(year, month + 1));
    return toIsoDate(year, month + 1, day);
  }

  const fullMatch = normalized.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);

  if (fullMatch) {
    return toIsoDate(Number(fullMatch[1]), Number(fullMatch[2]), Number(fullMatch[3]));
  }

  const slashMatch = normalized.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);

  if (slashMatch) {
    return toIsoDate(Number(slashMatch[1]), Number(slashMatch[2]), Number(slashMatch[3]));
  }

  const monthDayMatch = normalized.match(/(\d{1,2})月(\d{1,2})日/);

  if (monthDayMatch) {
    const month = Number(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);

    return toIsoDate(reference.getFullYear(), month, day);
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (isoMatch && !Number.isNaN(Date.parse(isoMatch[1]))) {
    return isoMatch[1];
  }

  return null;
};

const parseDurationDays = (text: string): number | null => {
  const rangeMonths = text.match(/(\d+)\s*[-~到至]\s*(\d+)\s*个?\s*月/);

  if (rangeMonths) {
    const low = Number(rangeMonths[1]);
    const high = Number(rangeMonths[2]);

    return Math.round(((low + high) / 2) * 30);
  }

  const singleMonth = text.match(/(\d+)\s*个?\s*月/);

  if (singleMonth) {
    return Number(singleMonth[1]) * 30;
  }

  const rangeWeeks = text.match(/(\d+)\s*[-~到至]\s*(\d+)\s*个?\s*周/);

  if (rangeWeeks) {
    const low = Number(rangeWeeks[1]);
    const high = Number(rangeWeeks[2]);

    return Math.round(((low + high) / 2) * 7);
  }

  const singleWeek = text.match(/(\d+)\s*个?\s*周/);

  if (singleWeek) {
    return Number(singleWeek[1]) * 7;
  }

  return null;
};

const inferTopic = (text: string): string | null => {
  if (/线性代数/.test(text)) {
    return "考研线性代数";
  }

  if (/高等数学|高数/.test(text)) {
    return "考研高等数学";
  }

  if (/概率论/.test(text)) {
    return "考研概率论";
  }

  if (/英语/.test(text)) {
    return "考研英语";
  }

  const examMatch = text.match(/考研[\u4e00-\u9fa5A-Za-z0-9·]{2,12}/);

  if (examMatch) {
    return examMatch[0];
  }

  return null;
};

export const inferTopicWithLLM = async (text: string): Promise<string | null> => {
  const hardcoded = inferTopic(text);
  if (hardcoded) return hardcoded;

  if (!text.trim() || text.length < 4) return null;

  try {
    const config = await getAgentModelConfig();
    if (!config) return null;

    const response = await fetchWithRetry(
      `${config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: "system",
              content: "从用户输入中提取计划的核心主题，输出为一个简短的中文名词短语（最多8个字）。如果无法确定主题，输出 null。只输出名词短语或 null，不要输出其他内容。",
            },
            { role: "user", content: text },
          ],
          temperature: 0,
          max_tokens: 32,
        }),
      },
      { maxRetries: 1, timeoutMs: 10_000 },
    );

    if (!response.ok) return null;
    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content || content.trim() === "null" || content.trim().length === 0) return null;

    return content.trim().slice(0, 16);
  } catch {
    return null;
  }
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  creative: ["创作", "写作", "画画", "音乐", "设计", "拍摄", "剪辑"],
  fitness: ["健身", "运动", "减肥", "跑步", "游泳", "瑜伽", "锻炼", "饮食"],
  study: ["学习", "复习", "考试", "考研", "高考", "课程", "练习", "习题", "教材", "章节"],
  travel: ["旅行", "旅游", "游玩", "景点", "路线", "酒店", "机票", "行程"],
  work: ["工作", "项目", "需求", "开发", "上线", "迭代", "交付", "客户"],
};

export const inferDomain = (topic: null | string, text: string): string => {
  const combined = `${topic ?? ""} ${text}`;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) return domain;
  }
  return "other";
};

const stripComposePlanPrefixes = (text: string) =>
  normalizeWhitespace(
    text
      .replace(/^(请你?|麻烦你?|帮我|请帮我|请|麻烦)?(为我|给我|帮忙)?(制定|规划|安排|设计|生成|做)(一个)?(完整)?(的)?(学习)?(方案|计划|规划)[:：，,\s]*/i, "")
      .replace(/^(关于|围绕|为了)/, "")
      .replace(/[。！!？?]+$/g, ""),
  );

export const parsePlanSeedFromText = (rawText: string): ParsedPlanSeed => {
  const sourceText = normalizeWhitespace(rawText);
  const topic = inferTopic(sourceText);
  const startDate = parseDateFromText(sourceText);
  const durationDays = parseDurationDays(sourceText);
  const dailyPace = /每天.{0,12}(一章|一节|一课|小时|h)/.test(sourceText)
    ? sourceText.match(/每天[^，。；;]{0,20}/)?.[0] ?? "每天约 1 章 + 练习"
    : /每周/.test(sourceText)
      ? sourceText.match(/每周[^，。；;]{0,20}/)?.[0] ?? null
      : null;

  let dueDate: string | null = null;

  if (startDate && durationDays) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + durationDays);
    dueDate = end.toISOString().split("T")[0] ?? null;
  }

  const core = stripComposePlanPrefixes(sourceText);
  const title = topic
    ? `${topic}${startDate ? `（${startDate} 起）` : ""}${durationDays ? ` · 约 ${Math.max(1, Math.round(durationDays / 7))} 周` : ""}`
    : core.length <= 36
      ? core
      : `${core.slice(0, 32).trimEnd()}…`;

  const goal = topic
    ? `在${durationDays ? `约 ${durationDays} 天` : "计划周期"}内系统完成${topic}复习${dailyPace ? `，节奏：${dailyPace}` : ""}。`
    : core.length <= 120
      ? core
      : `${core.slice(0, 100).trimEnd()}…`;

  return {
    dailyPace,
    dueDate,
    durationDays,
    goal,
    sourceText,
    startDate,
    title,
    topic,
  };
};

export const normalizeComposePlanArgs = (args: ComposePlanArgs): ComposePlanArgs => {
  const raw = normalizeWhitespace(
    [args.sourceText, args.goal, args.title].filter((item) => typeof item === "string" && item.trim()).join(" "),
  );
  const seed = parsePlanSeedFromText(raw || args.sourceText || args.goal || "");

  const explicitTitle = args.title ? normalizeWhitespace(args.title) : "";
  const titleLooksLikeRawPrompt =
    explicitTitle.length > 48 ||
    explicitTitle === seed.sourceText ||
    /请你|为我|规划|方案/.test(explicitTitle);

  return {
    ...args,
    goal: args.goal && args.goal.length <= 160 && !/请你|为我规划/.test(args.goal) ? args.goal : seed.goal,
    sourceText: seed.sourceText || args.sourceText,
    suggestedDueDate: args.suggestedDueDate ?? seed.dueDate,
    title: titleLooksLikeRawPrompt || !explicitTitle ? seed.title : explicitTitle,
  };
};

const LINEAR_ALGEBRA_PHASES: Array<{ title: string; tasks: string[]; estimatedDays: number }> = [
  {
    estimatedDays: 7,
    tasks: ["行列式与展开", "矩阵基本运算", "本章课后练习"],
    title: "行列式与矩阵基础",
  },
  {
    estimatedDays: 8,
    tasks: ["向量与线性组合", "线性相关与秩", "本章课后练习"],
    title: "向量与向量空间",
  },
  {
    estimatedDays: 8,
    tasks: ["高斯消元", "解的结构", "本章课后练习"],
    title: "线性方程组",
  },
  {
    estimatedDays: 8,
    tasks: ["特征值与特征向量", "对角化", "本章课后练习"],
    title: "特征值与对角化",
  },
  {
    estimatedDays: 7,
    tasks: ["二次型", "正定性与合同", "本章课后练习"],
    title: "二次型与综合",
  },
  {
    estimatedDays: 7,
    tasks: ["错题回顾", "模拟卷 1 套", "查漏补缺"],
    title: "冲刺与复盘",
  },
];

const scalePhaseDays = (phases: typeof LINEAR_ALGEBRA_PHASES, totalDays: number) => {
  const baseTotal = phases.reduce((sum, phase) => sum + phase.estimatedDays, 0);
  const ratio = totalDays / baseTotal;

  return phases.map((phase) => ({
    ...phase,
    estimatedDays: Math.max(3, Math.round(phase.estimatedDays * ratio)),
  }));
};

export const decomposePlanRuleBased = (args: ComposePlanArgs): DecomposedPlan | null => {
  const normalized = normalizeComposePlanArgs(args);
  const seed = parsePlanSeedFromText(normalized.sourceText || normalized.goal || "");
  const totalDays = seed.durationDays ?? 45;

  if (seed.topic?.includes("线性代数")) {
    const scaled = scalePhaseDays(LINEAR_ALGEBRA_PHASES, totalDays);
    const phases: DecomposedPhase[] = scaled.map((phase) => ({
      estimatedDays: phase.estimatedDays,
      goal: `完成${phase.title}相关知识点与练习。`,
      milestones: [
        {
          estimatedHours: 6,
          tasks: phase.tasks,
          title: phase.title,
        },
      ],
      title: phase.title,
    }));

    return {
      finalGoal: `在 ${totalDays} 天内完成考研线性代数系统复习。`,
      phases,
      prerequisites: ["线性代数教材", "近五年真题精选"],
      totalEstimatedDays: phases.reduce((sum, phase) => sum + phase.estimatedDays, 0),
      weeklyRhythm: seed.dailyPace ?? "每天 1 章 + 课后练习，周末集中复盘",
    };
  }

  if (!seed.topic && (normalized.sourceText?.length ?? 0) < 12) {
    return null;
  }

  const phaseCount = Math.min(6, Math.max(3, Math.round(totalDays / 10)));
  const daysPerPhase = Math.max(3, Math.round(totalDays / phaseCount));
  const phases: DecomposedPhase[] = Array.from({ length: phaseCount }, (_, index) => ({
    estimatedDays: daysPerPhase,
    goal: `完成第 ${index + 1} 阶段目标。`,
    milestones: [
      {
        estimatedHours: 4,
        tasks: [
          `拆解第 ${index + 1} 阶段任务清单`,
          `完成本阶段核心练习`,
          `记录疑问与复盘`,
        ],
        title: `阶段 ${index + 1} 里程碑`,
      },
    ],
    title: `阶段 ${index + 1}`,
  }));

  return {
    finalGoal: seed.goal,
    phases,
    prerequisites: [],
    totalEstimatedDays: phases.reduce((sum, phase) => sum + phase.estimatedDays, 0),
    weeklyRhythm: seed.dailyPace ?? "每天推进 1 个可验收小步",
  };
};
