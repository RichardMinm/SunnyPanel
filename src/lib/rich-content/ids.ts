import type { RichContentDocument, RichContentNode } from "./types";

const blockNodeTypes = new Set([
  "blockquote",
  "bulletList",
  "callout",
  "codeBlock",
  "heading",
  "horizontalRule",
  "image",
  "listItem",
  "orderedList",
  "paragraph",
  "table",
  "taskItem",
  "taskList",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringId = (attrs: unknown): attrs is Record<string, unknown> & { id: string } =>
  isRecord(attrs) && typeof attrs.id === "string" && attrs.id.length > 0;

export const ensureRichContentBlockIds = (document: RichContentDocument): RichContentDocument => {
  let nextId = 1;
  const originalIds = new Set<string>();
  const usedIds = new Set<string>();

  const collectOriginalIds = (node: RichContentNode) => {
    if (blockNodeTypes.has(node.type) && hasStringId(node.attrs)) {
      originalIds.add(node.attrs.id);
    }

    node.content?.forEach(collectOriginalIds);
  };

  const createId = (type: string) => {
    let id = `${type}-${nextId++}`;

    while (originalIds.has(id) || usedIds.has(id)) {
      id = `${type}-${nextId++}`;
    }

    usedIds.add(id);
    return id;
  };

  document.content?.forEach(collectOriginalIds);

  const addIds = (node: RichContentNode): RichContentNode => {
    const shouldHaveId = blockNodeTypes.has(node.type);
    let attrs = node.attrs;
    let attrsChanged = false;

    if (shouldHaveId) {
      if (hasStringId(node.attrs) && !usedIds.has(node.attrs.id)) {
        usedIds.add(node.attrs.id);
      } else {
        attrs = {
          ...(isRecord(node.attrs) ? node.attrs : {}),
          id: createId(node.type),
        };
        attrsChanged = true;
      }
    }

    const originalContent = node.content;
    const content = originalContent?.map(addIds);
    const contentChanged = content?.some((child, index) => child !== originalContent?.[index]) ?? false;
    const nodeWithAttrs = attrsChanged ? { ...node, attrs } : node;

    return contentChanged ? { ...nodeWithAttrs, content } : nodeWithAttrs;
  };

  return {
    ...document,
    content: document.content?.map(addIds),
  };
};
