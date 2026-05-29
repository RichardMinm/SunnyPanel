import { cache } from "react";

import { getWeekSchedule, type WeekSchedule } from "./items";

export const getCachedWeekSchedule = cache(
  async (fromDate: string, toDate: string): Promise<WeekSchedule> => getWeekSchedule(fromDate, toDate),
);
