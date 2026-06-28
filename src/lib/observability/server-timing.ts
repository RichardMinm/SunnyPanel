import "server-only";

/**
 * Lightweight server-side performance measurement for dashboard routes.
 *
 * Usage:
 *   const timing = createServerTiming();
 *   const t0 = timing.start("auth");
 *   // ... auth logic ...
 *   timing.end("auth", t0);
 *   // ... later ...
 *   timing.log();
 *
 * Output to server console as:
 *   [server-timing] /dashboard?threadId=29
 *     auth: 12ms
 *     loadThread: 3ms
 *     ...
 *     total: 47ms
 */

export type ServerTiming = ReturnType<typeof createServerTiming>;

export const createServerTiming = (label?: string) => {
  const entries: Array<{ label: string; durationMs: number }> = [];
  let totalStart = 0;
  let hasTotal = false;

  const start = (_phaseLabel: string) => {
    if (!hasTotal) {
      totalStart = performance.now();
      hasTotal = true;
    }

    return performance.now();
  };

  const end = (phaseLabel: string, phaseStart: number) => {
    const durationMs = Math.round((performance.now() - phaseStart) * 100) / 100;
    entries.push({ label: phaseLabel, durationMs });

    return durationMs;
  };

  const measure = async <T>(
    phaseLabel: string,
    fn: () => Promise<T>,
  ): Promise<T> => {
    const t0 = start(phaseLabel);
    try {
      return await fn();
    } finally {
      end(phaseLabel, t0);
    }
  };

  const log = () => {
    const totalMs = hasTotal
      ? Math.round((performance.now() - totalStart) * 100) / 100
      : 0;

    const labelPrefix = label ? ` ${label}` : "";
    const lines = entries
      .map((entry) => `  ${entry.label}: ${entry.durationMs}ms`)
      .join("\n");

    console.log(
      `[server-timing]${labelPrefix}\n${lines}\n  total: ${totalMs}ms`,
    );
  };

  const getResults = () => {
    const totalMs = hasTotal
      ? Math.round((performance.now() - totalStart) * 100) / 100
      : 0;

    const timings: Record<string, number> = { total: totalMs };
    for (const entry of entries) {
      timings[entry.label] = entry.durationMs;
    }

    return timings;
  };

  return { end, getResults, log, measure, start };
};
