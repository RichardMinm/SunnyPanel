import { mergeAttributes, Node } from "@tiptap/core";

export type MediaEmbedKind = "file" | "pdf" | "video";

export const MediaEmbed = Node.create({
  name: "mediaEmbed",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-id": attributes.id } : {}),
      },
      filename: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-filename") ?? "",
        renderHTML: (attributes) => ({ "data-filename": attributes.filename ?? "" }),
      },
      kind: {
        default: "file" as MediaEmbedKind,
        parseHTML: (element) => (element.getAttribute("data-kind") as MediaEmbedKind) || "file",
        renderHTML: (attributes) => ({ "data-kind": attributes.kind ?? "file" }),
      },
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => (attributes.src ? { "data-src": attributes.src } : {}),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") ?? "",
        renderHTML: (attributes) => ({ "data-title": attributes.title ?? "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='media-embed']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = node.attrs.title || node.attrs.filename || "媒体附件";
    const kind = node.attrs.kind || "file";

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "media-embed",
        "data-title": title,
        "data-kind": kind,
      }),
      title,
    ];
  },
});
