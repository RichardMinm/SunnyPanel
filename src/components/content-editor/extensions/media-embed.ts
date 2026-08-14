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

  addNodeView() {
    return ({ editor, getPos, node }) => {
      const figure = document.createElement("figure");
      const title = node.attrs.title || node.attrs.filename || "媒体附件";
      const kind = node.attrs.kind || "file";
      const src = node.attrs.src || "";
      figure.className = `sunny-rich-editor-media-embed is-${kind}`;
      figure.dataset.kind = kind;
      figure.contentEditable = "false";

      if (kind === "video") {
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.src = src;
        figure.append(video);
      } else {
        const link = document.createElement("a");
        link.href = src;
        link.rel = "noreferrer";
        link.target = "_blank";
        link.textContent = title;
        figure.append(link);
      }

      const caption = document.createElement("figcaption");
      caption.textContent = title;
      figure.append(caption);
      figure.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos === "number") editor.commands.setNodeSelection(pos);
      });

      return { dom: figure };
    };
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
