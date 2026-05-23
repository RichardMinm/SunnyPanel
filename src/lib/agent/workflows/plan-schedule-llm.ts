import type { Plan } from "@/payload-types";

import { completeStructured } from "../llm/complete-structured";
import { buildSmartScheduleSystemPrompt } from "../prompts/schedule";
import type { DecomposedPhase } from "./plan-decomposer";
import type { ScheduleGenerationOptions } from "./plan-schedule-link";

export type SmartScheduleItem = {
  date: string;
  endTime: string | null;
  isAllDay: boolean;
  phaseTitle: string;
  startTime: string | null;
  title: string;
};

const parseScheduleItems = (value: unknown): SmartScheduleItem[] | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawItems = Array.isArray(record.items) ? record.items : Array.isArray(value) ? value : null;

  if (!rawItems) {
    return null;
  }

  const items: SmartScheduleItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    const title = typeof row.title === "string" ? row.title : null;
    const phaseTitle = typeof row.phaseTitle === "string" ? row.phaseTitle : "阶段";

    if (!date || !title) {
      continue;
    }

    items.push({
      date,
      endTime: typeof row.endTime === "string" ? row.endTime : null,
      isAllDay: row.isAllDay === true,
      phaseTitle,
      startTime: typeof row.startTime === "string" ? row.startTime : null,
      title,
    });
  }

  return items.length > 0 ? items : null;
};

export const planSmartScheduleWithLLM = async (
  plan: Plan,
  phases: DecomposedPhase[],
  options: ScheduleGenerationOptions,
  occupiedSlots: Array<{ date: string; endTime?: string | null; startTime?: string | null; title: string }> = [],
): Promise<SmartScheduleItem[] | null> => {
  const taskManifest = phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.tasks.map((task) => ({
        estimatedHours: milestone.estimatedHours,
        milestone: milestone.title,
        phase: phase.title,
        task,
      })),
    ),
  );

  const userPayload = JSON.stringify(
    {
      defaultDurationMinutes: options.defaultDurationMinutes,
      defaultStartTime: options.defaultStartTime,
      occupiedSlots,
      planPriority: plan.priority,
      planTitle: plan.title,
      startDate: options.startDate,
      tasks: taskManifest,
      weeklyRhythm: options.weeklyRhythm ?? null,
    },
    null,
    2,
  );

  const result = await completeStructured({
    messages: [
      { role: "system", content: buildSmartScheduleSystemPrompt(options.startDate) },
      { role: "user", content: userPayload },
    ],
    parse: parseScheduleItems,
    temperature: 0.35,
  });

  return result?.data ?? null;
};
