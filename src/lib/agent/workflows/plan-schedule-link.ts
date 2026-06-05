import { createScheduleItem, getScheduleForDate } from "@/lib/schedule/items";
import type { Plan } from "@/payload-types";

import type { DecomposedPhase } from "./plan-decomposer";
import { planSmartScheduleWithLLM, type SmartScheduleItem } from "./plan-schedule-llm";

export type ScheduleGenerationOptions = {
  startDate: string;
  weeklyRhythm?: string;
  defaultStartTime: string;
  defaultDurationMinutes: number;
};

const addMinutesToTime = (time: string, minutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "10:00";
  const totalMinutes = h * 60 + m + minutes;
  const newHour = Math.floor(totalMinutes / 60) % 24;
  const newMinute = totalMinutes % 60;
  return `${String(newHour).padStart(2, "0")}:${String(newMinute).padStart(2, "0")}`;
};

const persistScheduleItems = async (
  plan: Plan,
  items: SmartScheduleItem[],
): Promise<Array<{ date: string; id: number; title: string; phaseTitle: string }>> => {
  const createdItems: Array<{ date: string; id: number; title: string; phaseTitle: string }> = [];

  for (const item of items) {
    try {
      const created = await createScheduleItem({
        title: item.title.startsWith("[") ? item.title : `[${item.phaseTitle}] ${item.title}`,
        description: `从计划「${plan.title}」智能排期生成。`,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        isAllDay: item.isAllDay,
        status: "planned",
        priority: plan.priority as "high" | "low" | "medium",
        sourceType: "plan",
        relatedPlan: plan.id,
        createdBy: "agent",
        agentBrief: `智能排期：${item.phaseTitle}`,
      });

      createdItems.push({ date: item.date, id: created.id, title: item.title, phaseTitle: item.phaseTitle });
    } catch {
      // 单条失败不阻塞整体
    }
  }

  return createdItems;
};

export const generateScheduleFromPlanRuleBased = async (
  plan: Plan,
  phases: DecomposedPhase[],
  options: ScheduleGenerationOptions,
): Promise<Array<{ date: string; id: number; title: string; phaseTitle: string }>> => {
  const ruleItems: SmartScheduleItem[] = [];
  const currentDate = new Date(options.startDate);

  for (const phase of phases) {
    for (const milestone of phase.milestones) {
      for (const task of milestone.tasks) {
        const dateStr = currentDate.toISOString().split("T")[0];

        if (!dateStr) {
          continue;
        }

        const endTime = options.defaultStartTime
          ? addMinutesToTime(options.defaultStartTime, options.defaultDurationMinutes)
          : null;

        ruleItems.push({
          date: dateStr,
          endTime,
          isAllDay: !options.defaultStartTime,
          phaseTitle: phase.title,
          startTime: options.defaultStartTime || null,
          title: task,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }

  return persistScheduleItems(plan, ruleItems);
};

export const generateScheduleFromPlan = async (
  plan: Plan,
  phases: DecomposedPhase[],
  options: ScheduleGenerationOptions,
): Promise<Array<{ date: string; id: number; title: string; phaseTitle: string }>> => {
  const start = options.startDate;
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 60);

  const occupied: Array<{ date: string; endTime?: string | null; startTime?: string | null; title: string }> = [];

  for (let cursor = new Date(start); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = cursor.toISOString().split("T")[0];

    if (!dateKey) {
      continue;
    }

    const dayItems = await getScheduleForDate(dateKey);

    for (const item of dayItems) {
      occupied.push({
        date: dateKey,
        endTime: item.endTime ?? null,
        startTime: item.startTime ?? null,
        title: item.title,
      });
    }
  }

  const llmItems = await planSmartScheduleWithLLM(plan, phases, options, occupied);

  if (llmItems && llmItems.length > 0) {
    return persistScheduleItems(plan, llmItems);
  }

  return generateScheduleFromPlanRuleBased(plan, phases, options);
};

export const summarizeScheduleGeneration = (
  items: Array<{ date: string; title: string; phaseTitle: string }>,
): string => {
  if (items.length === 0) return "未能生成任何日程条目。";

  const firstDate = items[0]?.date ?? "";
  const lastDate = items[items.length - 1]?.date ?? "";
  const phases = [...new Set(items.map((item) => item.phaseTitle))];

  return [
    `已生成 ${items.length} 条日程`,
    `覆盖 ${phases.length} 个阶段`,
    `时间范围：${firstDate} 至 ${lastDate}`,
  ].join("，");
};
