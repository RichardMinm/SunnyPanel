import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Mathematics from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { editorLowlight } from "@/lib/editor/lowlight";

import { Callout } from "./extensions/callout";
import { Highlight } from "./extensions/highlight";
import { PasteImageUpload } from "./extensions/image-upload";
import { MediaEmbed } from "./extensions/media-embed";
import { PageBreak } from "./extensions/page-break";
import { StableBlockId } from "./extensions/stable-block-id";

export const buildContentEditorExtensions = (options?: { placeholder?: string }): Extensions => {
  const extensions: Extensions = [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
    }),
    CodeBlockLowlight.configure({
      defaultLanguage: "plaintext",
      lowlight: editorLowlight,
    }),
    Link.configure({ openOnClick: false }),
    Image.configure({ allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Typography,
    Highlight,
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Mathematics.configure({
      katexOptions: { throwOnError: false },
    }),
    Callout,
    MediaEmbed,
    PageBreak,
    StableBlockId,
    PasteImageUpload,
  ];

  if (options?.placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder: options.placeholder,
      }),
    );
  }

  return extensions;
};
