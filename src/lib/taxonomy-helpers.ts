/** Normalize a value for tag comparison: lowercase + trim whitespace. */
export function normalizeTag(value: string): string {
  return value.toLowerCase().trim();
}

/** Slugify a human-readable label into a URL-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
