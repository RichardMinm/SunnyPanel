"use client";

import { MDXEditor } from "@mdxeditor/editor";

import { EMPTY_MARKDOWN, SUNNY_PROSE_CLASS } from "./constants";
import { buildSunnyEditorPlugins } from "./editor-plugins";

type MarkdownContentProps = {
  className?: string;
  markdown: string;
};

export function MarkdownContent({ className, markdown }: MarkdownContentProps) {
  return (
    <div className={["sunny-markdown-display", className].filter(Boolean).join(" ")}>
      <MDXEditor
        markdown={markdown || EMPTY_MARKDOWN}
        readOnly
        contentEditableClassName={SUNNY_PROSE_CLASS}
        plugins={buildSunnyEditorPlugins("readonly")}
      />
    </div>
  );
}
