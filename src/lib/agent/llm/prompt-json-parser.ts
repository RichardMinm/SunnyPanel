/** Strict whole-output JSON extraction for prompt_json providers. */

export type PromptJsonExtractionResult =
  | Readonly<{ ok: true; candidate: string }>
  | Readonly<{ ok: false }>;

export type PromptJsonParseResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; stage: "extraction" | "parse" }>;

/**
 * Accept only a complete JSON object or one complete JSON Markdown fence.
 * There is intentionally no substring selection, balancing, or repair.
 */
export const extractWholePromptJson = (
  text: string,
): PromptJsonExtractionResult => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return Object.freeze({ ok: true, candidate: trimmed });
  }

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim();
  if (!candidate?.startsWith("{") || !candidate.endsWith("}")) {
    return Object.freeze({ ok: false });
  }

  return Object.freeze({ ok: true, candidate });
};

export const parsePromptJsonObject = (text: string): PromptJsonParseResult => {
  const extracted = extractWholePromptJson(text);
  if (!extracted.ok) return Object.freeze({ ok: false, stage: "extraction" });

  try {
    const value: unknown = JSON.parse(extracted.candidate);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return Object.freeze({ ok: false, stage: "extraction" });
    }
    return Object.freeze({ ok: true, value });
  } catch {
    return Object.freeze({ ok: false, stage: "parse" });
  }
};
