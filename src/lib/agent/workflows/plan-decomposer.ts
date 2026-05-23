import type { AgentPromptContext } from "../prompts";
import type { ComposePlanArgs } from "../schemas";
import { fetchWithRetry } from "../client";

import { decomposePlanRuleBased, normalizeComposePlanArgs, parsePlanSeedFromText } from "./plan-seed";

export type DecomposedMilestone = {
  title: string;
  tasks: string[];
  estimatedHours: number;
};

export type DecomposedPhase = {
  title: string;
  goal: string;
  estimatedDays: number;
  milestones: DecomposedMilestone[];
};

export type DecomposedPlan = {
  phases: DecomposedPhase[];
  totalEstimatedDays: number;
  weeklyRhythm: string;
  prerequisites: string[];
  finalGoal: string;
};

type AgentModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const PLAN_DECOMPOSE_SYSTEM_PROMPT = `你是一个学习规划和项目管理助手。用户需要你把一个模糊的学习/工作目标拆解成可执行的阶段计划。

请严格按以下 JSON 结构输出（不要输出其他内容）：

{
  "phases": [
    {
      "title": "阶段名称",
      "goal": "本阶段要达成的具体目标",
      "estimatedDays": 14,
      "milestones": [
        {
          "title": "里程碑名称",
          "tasks": ["具体任务1", "具体任务2"],
          "estimatedHours": 4
        }
      ]
    }
  ],
  "totalEstimatedDays": 60,
  "weeklyRhythm": "每天2小时，周末4小时",
  "prerequisites": ["前置知识或准备"],
  "finalGoal": "完成后的最终状态"
}

原则：
- 阶段数量控制在 3-6 个
- 每个阶段 2-4 个里程碑
- 每个里程碑 2-5 个具体任务
- 时间估算要现实
- 如果有明确的领域知识（如高等数学），请具体拆出章节/知识点
- 输出纯 JSON，不要用 markdown 代码块包裹`;

const validateDecomposedPlan = (data: unknown): DecomposedPlan | null => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.phases) || d.phases.length === 0) return null;

  const phases: DecomposedPhase[] = [];
  for (const p of d.phases) {
    if (!p || typeof p !== "object") continue;
    const phase = p as Record<string, unknown>;
    const milestones: DecomposedMilestone[] = [];
    if (Array.isArray(phase.milestones)) {
      for (const m of phase.milestones) {
        if (!m || typeof m !== "object") continue;
        const ms = m as Record<string, unknown>;
        milestones.push({
          title: String(ms.title || ""),
          tasks: Array.isArray(ms.tasks) ? ms.tasks.map(String).slice(0, 8) : [],
          estimatedHours: Number(ms.estimatedHours) || 4,
        });
      }
    }
    if (!milestones.length) continue;
    phases.push({
      title: String(phase.title || ""),
      goal: String(phase.goal || ""),
      estimatedDays: Number(phase.estimatedDays) || 14,
      milestones,
    });
  }

  if (phases.length === 0) return null;

  return {
    phases,
    totalEstimatedDays: Number(d.totalEstimatedDays) || 60,
    weeklyRhythm: String(d.weeklyRhythm || "每天1-2小时"),
    prerequisites: Array.isArray(d.prerequisites) ? d.prerequisites.map(String) : [],
    finalGoal: String(d.finalGoal || ""),
  };
};

export const decomposePlanWithLLM = async (
  args: ComposePlanArgs,
  context: AgentPromptContext,
  getConfig: () => Promise<AgentModelConfig | null>,
): Promise<DecomposedPlan | null> => {
  const normalized = normalizeComposePlanArgs(args);
  const seed = parsePlanSeedFromText(normalized.sourceText || normalized.goal || "");

  if (!seed.sourceText.trim()) {
    return null;
  }

  const config = await getConfig();

  if (!config) {
    return null;
  }

  const existingPlans = context.plans
    .map((p) => `- ${p.title} [${p.state}]`)
    .join("\n");

  const userContent = [
    "请为以下学习目标制定阶段化计划（含具体章节/任务，不要写空泛流程套话）：",
    seed.topic ? `主题：${seed.topic}` : null,
    `目标描述：${seed.goal}`,
    seed.startDate ? `开始日期：${seed.startDate}` : null,
    seed.durationDays ? `目标周期：约 ${seed.durationDays} 天` : null,
    seed.dailyPace ? `学习节奏：${seed.dailyPace}` : null,
    normalized.motivation ? `动机：${normalized.motivation}` : null,
    normalized.scope ? `范围：${normalized.scope}` : null,
    normalized.outOfScope ? `不在范围：${normalized.outOfScope}` : null,
    existingPlans
      ? `\n当前用户已有的计划（避免重复）：\n${existingPlans}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system", content: PLAN_DECOMPOSE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
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
          messages,
          temperature: 0.3,
          max_tokens: 4096,
        }),
      },
      { maxRetries: 1, timeoutMs: 30000 },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const content: string | undefined =
      data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[1]);
    const validated = validateDecomposedPlan(parsed);

    if (validated) {
      return validated;
    }
  } catch {
    return null;
  }

  return null;
};

export const decomposePlanForCompose = async (
  args: ComposePlanArgs,
  context: AgentPromptContext,
  getConfig: () => Promise<AgentModelConfig | null>,
): Promise<DecomposedPlan | null> => {
  const llmPlan = await decomposePlanWithLLM(args, context, getConfig);

  if (llmPlan) {
    return llmPlan;
  }

  return decomposePlanRuleBased(normalizeComposePlanArgs(args));
};
