"use client";

type ImageUploadNodeViewProps = {
  alt?: null | string;
  src?: null | string;
  title?: null | string;
};

export function ImageUploadNodeView({ alt, src, title }: ImageUploadNodeViewProps) {
  if (!src) {
    return (
      <figure className="sunny-rich-editor-image is-empty">
        <div className="sunny-rich-editor-image-placeholder">图片上传中</div>
      </figure>
    );
  }

  return (
    <figure className="sunny-rich-editor-image">
      <img alt={alt ?? title ?? ""} src={src} />
      {alt || title ? <figcaption>{alt ?? title}</figcaption> : null}
    </figure>
  );
}
