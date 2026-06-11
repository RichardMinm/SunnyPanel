import type { RichContentDocument, RichContentNode } from "./types";

const blockNodeTypes = new Set([
  "blockquote",
  "bulletList",
  "codeBlock",
  "heading",
  "horizontalRule",
  "image",
  "listItem",
  "orderedList",
  "paragraph",
  "taskItem",
  "taskList",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringId = (attrs: unknown): attrs is Record<string, unknown> & { id: string } =>
  isRecord(attrs) && typeof attrs.id === "string" && attrs.id.length > 0;

export const ensureRichContentBlockIds = (document: RichContentDocument): RichContentDocument => {
  let nextId = 1;

  const addIds = (node: RichContentNode): RichContentNode => {
    const content = node.content?.map(addIds);
    const shouldHaveId = blockNodeTypes.has(node.type);

    if (!shouldHaveId || hasStringId(node.attrs)) {
      return content === node.content ? node : { ...node, content };
    }

    return {
      ...node,
      attrs: {
        ...(isRecord(node.attrs) ? node.attrs : {}),
        id: `${node.type}-${nextId++}`,
      },
      content,
    };
  };

  return {
    ...document,
    content: document.content?.map(addIds),
  };
};
