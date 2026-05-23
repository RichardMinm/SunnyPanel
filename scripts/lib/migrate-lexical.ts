import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

export type LexicalMigrationWarning = "contains-table";

export type LexicalMigrationResult = {
  markdown: string;
  warnings: LexicalMigrationWarning[];
};

const isLexicalDocument = (value: unknown): value is { root?: unknown } =>
  typeof value === "object" && value !== null && "root" in value;

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, "").trim());

const inlineHtmlToMarkdown = (html: string) => {
  let result = html;

  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  result = result.replace(
    /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, label) => `[${stripTags(label)}](${decodeHtml(href)})`,
  );
  result = result.replace(/<br\s*\/?>/gi, "\n");

  return stripTags(result);
};

const escapeTableCell = (value: string) =>
  inlineHtmlToMarkdown(value).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

const imgTagToMarkdown = (tag: string) => {
  const src = tag.match(/\bsrc\s*=\s*"([^"]+)"/i)?.[1] ?? tag.match(/\bsrc\s*=\s*'([^']+)'/i)?.[1];

  if (!src) {
    return "";
  }

  const alt = tag.match(/\balt\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\balt\s*=\s*'([^']*)'/i)?.[1] ?? "image";

  return `\n\n![${decodeHtml(alt)}](${decodeHtml(src)})\n\n`;
};

const listItemsToMarkdown = (listBody: string, ordered: boolean) => {
  let index = 0;

  return listBody.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, body) => {
    const item = inlineHtmlToMarkdown(body);

    if (ordered) {
      index += 1;

      return `\n${index}. ${item}`;
    }

    return `\n- ${item}`;
  });
};

const tableHtmlToGfm = (tableBody: string) => {
  const rows: string[][] = [];

  for (const rowMatch of tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
      cells.push(escapeTableCell(cellMatch[1]));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizeRow = (row: string[]) => [
    ...row,
    ...Array.from({ length: Math.max(0, columnCount - row.length) }, () => ""),
  ];
  const lines = rows.map((row) => `| ${normalizeRow(row).join(" | ")} |`);

  if (rows.length > 1) {
    lines.splice(1, 0, `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`);
  }

  return `\n\n${lines.join("\n")}\n\n`;
};

const htmlToMarkdown = (html: string): LexicalMigrationResult => {
  let markdown = html.trim();
  const warnings: LexicalMigrationWarning[] = /<table[\s>]/i.test(html) ? ["contains-table"] : [];

  markdown = markdown.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableBody) => {
    const tableMarkdown = tableHtmlToGfm(tableBody);

    return tableMarkdown || _match;
  });

  markdown = markdown.replace(/<img\b[^>]*>/gi, (tag) => imgTagToMarkdown(tag));
  markdown = markdown.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  markdown = markdown.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_match, body) => `\n\n# ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_match, body) => `\n\n## ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, body) => `\n\n### ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_match, body) => `\n\n#### ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_match, body) => `\n\n##### ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_match, body) => `\n\n###### ${inlineHtmlToMarkdown(body)}\n\n`);
  markdown = markdown.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_match, body) => `\n\n> ${inlineHtmlToMarkdown(body).replace(/\n+/g, "\n> ")}\n\n`,
  );
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_match, body) => {
    const code = decodeHtml(body).replace(/\n$/, "");

    return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
  });
  markdown = markdown.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, body) => `${listItemsToMarkdown(body, true)}\n\n`);
  markdown = markdown.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, body) => `${listItemsToMarkdown(body, false)}\n\n`);
  markdown = markdown.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, body) => `\n\n${inlineHtmlToMarkdown(body)}\n\n`);

  markdown = inlineHtmlToMarkdown(markdown);
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

  return { markdown, warnings };
};

export const lexicalContentToMarkdownWithMeta = (data: unknown): LexicalMigrationResult => {
  if (!isLexicalDocument(data)) {
    return { markdown: "", warnings: [] };
  }

  const html = convertLexicalToHTML({
    data: data as SerializedEditorState,
    disableContainer: true,
  });

  return htmlToMarkdown(html);
};

export const lexicalContentToMarkdown = (data: unknown) => lexicalContentToMarkdownWithMeta(data).markdown;
