import { Extension } from "@tiptap/core";

const blockTypesWithIds = [
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
];

export const StableBlockId = Extension.create({
  name: "stableBlockId",

  addGlobalAttributes() {
    return [
      {
        types: blockTypesWithIds,
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-id"),
            renderHTML: (attributes) => (attributes.id ? { "data-id": attributes.id } : {}),
          },
        },
      },
    ];
  },
});
