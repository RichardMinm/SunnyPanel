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
  const usedIds = new Set<string>();

  const collectIds = (node: RichContentNode) => {
    if (hasStringId(node.attrs)) {
      usedIds.add(node.attrs.id);
    }

    node.content?.forEach(collectIds);
  };

  const createId = (type: string) => {
    let id = `${type}-${nextId++}`;

    while (usedIds.has(id)) {
      id = `${type}-${nextId++}`;
    }

    usedIds.add(id);
    return id;
  };

  document.content?.forEach(collectIds);

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
        id: createId(node.type),
      },
      content,
    };
  };

  return {
    ...document,
    content: document.content?.map(addIds),
  };
};
