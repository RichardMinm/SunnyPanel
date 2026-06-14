import type { Field } from "payload";

import { deriveRichContentBeforeChange } from "@/lib/payload/rich-content-hooks";
import { RICH_CONTENT_VERSION } from "@/lib/rich-content/defaults";

export const richContentFields = ({
  label,
  legacyLabel = "旧 Markdown 内容",
}: {
  label: string;
  legacyLabel?: string;
}): Field[] => [
  {
    name: "contentRich",
    type: "json",
    label,
    required: true,
    hooks: {
      beforeChange: [deriveRichContentBeforeChange],
    },
    admin: {
      description: "Dashboard Writing 使用的结构化富文本内容。",
    },
  },
  {
    name: "contentText",
    type: "textarea",
    label: "纯文本内容",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentExcerpt",
    type: "textarea",
    label: "内容摘要",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentOutline",
    type: "json",
    label: "内容大纲",
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "contentVersion",
    type: "text",
    label: "内容版本",
    defaultValue: RICH_CONTENT_VERSION,
    admin: {
      readOnly: true,
      position: "sidebar",
    },
  },
  {
    name: "legacyContentMarkdown",
    type: "textarea",
    label: legacyLabel,
    admin: {
      description: "迁移和回滚来源；Dashboard 不写入这个字段。",
      position: "sidebar",
    },
  },
];
