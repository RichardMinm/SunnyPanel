import { editorLowlight } from "@/lib/editor/lowlight";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type HastNode = {
  children?: HastNode[];
  properties?: { className?: string | string[] };
  tagName?: string;
  type: string;
  value?: string;
};

const treeToHtml = (node: HastNode): string => {
  if (node.type === "text") {
    return escapeHtml(node.value ?? "");
  }

  if (node.type !== "element" || !node.tagName) {
    return (node.children ?? []).map(treeToHtml).join("");
  }

  const classNames = node.properties?.className;
  const classAttr = Array.isArray(classNames)
    ? ` class="${classNames.join(" ")}"`
    : classNames
      ? ` class="${classNames}"`
      : "";

  const inner = (node.children ?? []).map(treeToHtml).join("");
  return `<${node.tagName}${classAttr}>${inner}</${node.tagName}>`;
};

export function highlightCodeHtml(code: string, language?: string | null) {
  const normalized = language?.trim().toLowerCase() || "plaintext";

  try {
    if (normalized && normalized !== "plaintext" && editorLowlight.registered(normalized)) {
      const tree = editorLowlight.highlight(normalized, code);
      return treeToHtml(tree as HastNode);
    }

    const tree = editorLowlight.highlightAuto(code);
    return treeToHtml(tree as HastNode);
  } catch {
    return escapeHtml(code);
  }
}
