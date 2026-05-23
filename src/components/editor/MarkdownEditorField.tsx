"use client";

import { useField } from "@payloadcms/ui";
import { MDXEditor } from "@mdxeditor/editor";
import { useMemo } from "react";

import { EMPTY_MARKDOWN, SUNNY_PROSE_CLASS } from "./constants";
import { buildSunnyEditorPlugins, type EditorPluginMode } from "./editor-plugins";

type MarkdownEditorFieldProps = {
  field: {
    admin?: {
      custom?: {
        toolbarMode?: EditorPluginMode;
      };
    };
  };
  path: string;
};

export function MarkdownEditorField({ field, path }: MarkdownEditorFieldProps) {
  const { setValue, value } = useField<string>({ path });
  const toolbarMode = field.admin?.custom?.toolbarMode === "minimal" ? "minimal" : "edit";
  const plugins = useMemo(() => buildSunnyEditorPlugins(toolbarMode), [toolbarMode]);

  return (
    <div
      className={[
        "sunny-markdown-editor-root",
        toolbarMode === "minimal" ? "sunny-markdown-editor-root--minimal" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <MDXEditor
        markdown={value ?? EMPTY_MARKDOWN}
        onChange={(nextValue) => setValue(nextValue)}
        contentEditableClassName={SUNNY_PROSE_CLASS}
        placeholder="开始写作。支持 Markdown 快捷键与所见即所得排版。"
        plugins={plugins}
      />
    </div>
  );
}
