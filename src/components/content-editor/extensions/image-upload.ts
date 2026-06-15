import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { uploadDashboardImage } from "@/lib/editor/upload-dashboard-image";

const imageFilesFromList = (files: FileList | null | undefined) =>
  Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));

const insertUploadedImages = async (editor: Editor, files: File[]) => {
  for (const file of files) {
    const result = await uploadDashboardImage(file);
    editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
  }
};

export const PasteImageUpload = Extension.create({
  name: "pasteImageUpload",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop: (_view, event) => {
            const files = imageFilesFromList(event.dataTransfer?.files);

            if (files.length === 0) {
              return false;
            }

            event.preventDefault();
            void insertUploadedImages(this.editor, files);

            return true;
          },
          handlePaste: (_view, event) => {
            const files = imageFilesFromList(event.clipboardData?.files);

            if (files.length === 0) {
              return false;
            }

            event.preventDefault();
            void insertUploadedImages(this.editor, files);

            return true;
          },
        },
      }),
    ];
  },
});
