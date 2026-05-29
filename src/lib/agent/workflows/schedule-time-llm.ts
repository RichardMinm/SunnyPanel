import { completeStructured } from "../llm/complete-structured";
import { buildScheduleTimeParseSystemPrompt } from "../prompts/schedule";

export type ParsedScheduleTime = {
  confidence: number;
  date: string | null;
  durationMinutes: number;
  endTime: string | null;
  isAllDay: boolean;
  startTime: string | null;
};

const parseParsedScheduleTime = (value: unknown): ParsedScheduleTime | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    confidence: typeof record.confidence === "number" ? record.confidence : 0.5,
    date: typeof record.date === "string" ? record.date : null,
    durationMinutes: typeof record.durationMinutes === "number" ? record.durationMinutes : 90,
    endTime: typeof record.endTime === "string" ? record.endTime : null,
    isAllDay: record.isAllDay === true,
    startTime: typeof record.startTime === "string" ? record.startTime : null,
  };
};

export const inferScheduleTimeWithLLM = async (
  text: string,
  now: string,
): Promise<ParsedScheduleTime | null> => {
  const result = await completeStructured({
    messages: [
      { role: "system", content: buildScheduleTimeParseSystemPrompt(now) },
      { role: "user", content: text },
    ],
    parse: parseParsedScheduleTime,
    temperature: 0.1,
  });

  return result?.data ?? null;
};
