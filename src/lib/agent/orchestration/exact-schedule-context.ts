import type {
  AgentContextScheduleItem,
  AgentContextSource,
} from "../context-builder";
import { parseExactScheduleCompletionReference } from "./deterministic-existing-schedule-boundary";

type ExactScheduleLoader = (
  scheduleId: number,
) => Promise<AgentContextScheduleItem | null>;

const normalizeContractText = (value: string): string =>
  value.normalize("NFKC").trim();

/**
 * Hydrate an explicitly referenced Schedule independently from the calendar
 * window. Schedule dates are normally bounded for prompt size, but a user-owned
 * exact ID must still be available to the deterministic resource boundary.
 */
export const hydrateExactScheduleCompletionContext = async ({
  loadSchedule,
  message,
  source,
}: Readonly<{
  loadSchedule: ExactScheduleLoader;
  message: string;
  source: AgentContextSource;
}>): Promise<AgentContextSource> => {
  const reference = parseExactScheduleCompletionReference(message);
  if (!reference) return source;

  const currentSchedules = source.schedules ?? [];
  if (currentSchedules.some((schedule) => schedule.id === reference.scheduleId)) {
    return source;
  }

  const schedule = await loadSchedule(reference.scheduleId);
  if (
    !schedule
    || schedule.status !== "planned"
    || normalizeContractText(schedule.title) !== reference.title
  ) {
    return source;
  }

  return {
    ...source,
    schedules: [...currentSchedules, schedule],
  };
};
