import type { ReactNode } from "react";

import { isRichContentDocument } from "@/lib/rich-content/validate";
import type { RichContentDocument, RichContentNode } from "@/lib/rich-content/types";

type RichContentRendererProps = {
  className?: string;
  content: unknown;
};

const allowedLinkProtocols = ["http:", "https:", "mailto:", "tel:"];

const getAttrString = (node: RichContentNode, key: string) => {
  const value = node.attrs?.[key];

  return typeof value === "string" ? value : undefined;
};

const getHeadingLevel = (node: RichContentNode) => {
  const level = node.attrs?.level;

  return level === 1 || level === 2 || level === 3 ? level : 2;
};

const getOrderedListStart = (node: RichContentNode) => {
  const start = node.attrs?.start;

  return typeof start === "number" && Number.isInteger(start) && start > 1 ? start : undefined;
};

const isSafeHref = (href: string) => {
  if (href.startsWith("/") || href.startsWith("#")) {
    return true;
  }

  try {
    return allowedLinkProtocols.includes(new URL(href).protocol);
  } catch {
    return false;
  }
};

const getPlainText = (node: RichContentNode): string => {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return node.content?.map(getPlainText).join("") ?? "";
};

const renderMarks = (node: RichContentNode, text: string, key: string) => {
  const marks = node.marks ?? [];

  return marks.reduce<ReactNode>((child, mark, index) => {
    const markKey = `${key}-mark-${index}`;

    if (mark.type === "bold") {
      return <strong key={markKey}>{child}</strong>;
    }

    if (mark.type === "italic") {
      return <em key={markKey}>{child}</em>;
    }

    if (mark.type === "strike") {
      return <s key={markKey}>{child}</s>;
    }

    if (mark.type === "code") {
      return <code key={markKey}>{child}</code>;
    }

    if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";

      if (!href || !isSafeHref(href)) {
        return child;
      }

      return (
        <a href={href} key={markKey} rel="noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>
          {child}
        </a>
      );
    }

    return child;
  }, text);
};

const renderChildren = (node: RichContentNode, key: string) =>
  node.content?.map((child, index) => renderNode(child, `${key}-${index}`)) ?? null;

const renderNode = (node: RichContentNode, key: string): ReactNode => {
  if (node.type === "text") {
    return renderMarks(node, node.text ?? "", key);
  }

  if (node.type === "hardBreak") {
    return <br key={key} />;
  }

  if (node.type === "paragraph") {
    return <p key={key}>{renderChildren(node, key)}</p>;
  }

  if (node.type === "heading") {
    const id = getAttrString(node, "id");
    const children = renderChildren(node, key);
    const level = getHeadingLevel(node);

    if (level === 1) {
      return <h1 id={id} key={key}>{children}</h1>;
    }

    if (level === 3) {
      return <h3 id={id} key={key}>{children}</h3>;
    }

    return <h2 id={id} key={key}>{children}</h2>;
  }

  if (node.type === "bulletList") {
    return <ul key={key}>{renderChildren(node, key)}</ul>;
  }

  if (node.type === "orderedList") {
    return <ol key={key} start={getOrderedListStart(node)}>{renderChildren(node, key)}</ol>;
  }

  if (node.type === "listItem") {
    return <li key={key}>{renderChildren(node, key)}</li>;
  }

  if (node.type === "taskList") {
    return <ul className="sunny-rich-content-task-list" key={key}>{renderChildren(node, key)}</ul>;
  }

  if (node.type === "taskItem") {
    const checked = node.attrs?.checked === true;

    return (
      <li className="sunny-rich-content-task-item" data-checked={checked ? "true" : "false"} key={key}>
        <input checked={checked} readOnly type="checkbox" />
        <span>{renderChildren(node, key)}</span>
      </li>
    );
  }

  if (node.type === "blockquote") {
    return <blockquote key={key}>{renderChildren(node, key)}</blockquote>;
  }

  if (node.type === "codeBlock") {
    const language = getAttrString(node, "language");

    return (
      <pre data-language={language} key={key}>
        <code>{getPlainText(node)}</code>
      </pre>
    );
  }

  if (node.type === "horizontalRule") {
    return <hr key={key} />;
  }

  if (node.type === "image") {
    const alt = getAttrString(node, "alt") ?? "";
    const src = getAttrString(node, "src");
    const title = getAttrString(node, "title");

    if (!src) {
      return null;
    }

    return (
      <figure className="sunny-rich-content-image" key={key}>
        <img src={src} alt={alt} title={title} />
        {alt || title ? <figcaption>{alt || title}</figcaption> : null}
      </figure>
    );
  }

  if (node.type === "callout") {
    const tone = getAttrString(node, "tone") ?? "note";

    return (
      <aside className="sunny-rich-content-callout" data-tone={tone} key={key}>
        {renderChildren(node, key)}
      </aside>
    );
  }

  if (node.type === "table") {
    return <table key={key}><tbody>{renderChildren(node, key)}</tbody></table>;
  }

  if (node.type === "tableRow") {
    return <tr key={key}>{renderChildren(node, key)}</tr>;
  }

  if (node.type === "tableHeader") {
    return <th key={key}>{renderChildren(node, key)}</th>;
  }

  if (node.type === "tableCell") {
    return <td key={key}>{renderChildren(node, key)}</td>;
  }

  return renderChildren(node, key);
};

export function RichContentRenderer({ className, content }: RichContentRendererProps) {
  if (!isRichContentDocument(content)) {
    return null;
  }

  const document = content as RichContentDocument;
  const renderedContent = document.content?.map((node, index) => renderNode(node, `node-${index}`)) ?? null;

  return (
    <div className={["sunny-rich-content-display", "sunny-prose", className].filter(Boolean).join(" ")}>
      {renderedContent}
    </div>
  );
}
