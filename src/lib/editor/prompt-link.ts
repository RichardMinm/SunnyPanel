/**
 * Prompts the user for a link URL via the browser's prompt dialog.
 * Returns the trimmed input, or null if cancelled / empty / unsafe.
 */
export function promptLinkHref(): null | string {
  if (typeof window === "undefined") return null;
  const raw = window.prompt("链接地址");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}
