import type { FieldHook } from "payload";

import { RICH_CONTENT_VERSION } from "@/lib/rich-content/defaults";
import { deriveRichContentFields } from "@/lib/rich-content/derive";
import { normalizeRichContentDocument } from "@/lib/rich-content/validate";

export const deriveRichContentBeforeChange: FieldHook = ({ data, value }) => {
  const normalized = normalizeRichContentDocument(value);
  const derived = deriveRichContentFields(normalized);

  if (data && typeof data === "object") {
    data.contentText = derived.contentText;
    data.contentExcerpt = derived.contentExcerpt;
    data.contentOutline = derived.contentOutline;
    data.contentVersion = RICH_CONTENT_VERSION;
  }

  return normalized;
};
