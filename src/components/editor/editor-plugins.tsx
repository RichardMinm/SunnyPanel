"use client";

import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertThematicBreak,
  ListsToggle,
  UndoRedo,
  codeBlockPlugin,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type RealmPlugin,
} from "@mdxeditor/editor";

import { uploadMarkdownImage } from "@/lib/markdown/media-upload";

export type EditorPluginMode = "edit" | "minimal" | "readonly";

const basePlugins = (): RealmPlugin[] => [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  linkPlugin(),
  thematicBreakPlugin(),
  markdownShortcutPlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
];

const editToolbarContents = (minimal: boolean) => {
  function SunnyEditorToolbarContents() {
    return minimal ? (
      <DiffSourceToggleWrapper>
        <UndoRedo />
        <BoldItalicUnderlineToggles />
        <ListsToggle />
        <CreateLink />
      </DiffSourceToggleWrapper>
    ) : (
      <DiffSourceToggleWrapper>
        <UndoRedo />
        <BoldItalicUnderlineToggles />
        <ListsToggle />
        <BlockTypeSelect />
        <CreateLink />
        <InsertImage />
        <InsertCodeBlock />
        <InsertThematicBreak />
      </DiffSourceToggleWrapper>
    );
  }

  return SunnyEditorToolbarContents;
};

export const buildSunnyEditorPlugins = (mode: EditorPluginMode): RealmPlugin[] => {
  if (mode === "readonly") {
    return [...basePlugins(), imagePlugin()];
  }

  const minimal = mode === "minimal";

  return [
    ...basePlugins(),
    diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: "" }),
    imagePlugin({
      imageUploadHandler: uploadMarkdownImage,
    }),
    toolbarPlugin({
      toolbarContents: editToolbarContents(minimal),
    }),
  ];
};
