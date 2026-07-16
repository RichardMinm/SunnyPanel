/** Shared normalization for deterministic plan-title resolution. */
export const normalizePlanTitle = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
