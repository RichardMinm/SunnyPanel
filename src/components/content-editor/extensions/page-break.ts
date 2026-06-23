import { mergeAttributes, Node } from "@tiptap/core";

export const PageBreak = Node.create({
  name: "pageBreak",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-id": attributes.id } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='page-break']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-break",
        "aria-hidden": "true",
      }),
    ];
  },
});
