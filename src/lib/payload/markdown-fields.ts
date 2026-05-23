import type { Field } from "payload";

export const markdownContentField = (options?: {
  description?: string;
  label?: string;
  toolbarMode?: "edit" | "minimal";
}): Field => ({
  name: "content",
  type: "textarea",
  label: options?.label ?? "正文",
  required: true,
  admin: {
    description: options?.description ?? "支持 Markdown。所见即所得编辑。",
    components: {
      Field: "@/components/editor/MarkdownEditorField#MarkdownEditorField",
    },
    custom: {
      toolbarMode: options?.toolbarMode ?? "edit",
    },
  },
});
