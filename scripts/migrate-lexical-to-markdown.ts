import "dotenv/config";

import { getPayload } from "payload";

process.env.PAYLOAD_DB_PUSH = "false";

const collections = ["posts", "pages"] as const;

const isLexicalDocument = (value: unknown): value is { root?: unknown } =>
  typeof value === "object" && value !== null && "root" in value;

type LegacyContentDocument = {
  content?: unknown;
  id: number | string;
  legacyContentMarkdown?: null | string;
};

const run = async () => {
  const { default: config } = await import("../payload.config.ts");
  const { lexicalContentToMarkdownWithMeta } = await import("./lib/migrate-lexical.ts");
  const { markdownToRichContent } = await import("../src/lib/rich-content/markdown-to-rich.ts");

  const payload = await getPayload({ config });
  const report = {
    failed: [] as Array<{ collection: string; id: number | string; reason: string }>,
    migrated: [] as Array<{ collection: string; id: number | string }>,
    skipped: [] as Array<{ collection: string; id: number | string; reason: string }>,
    warnings: [] as Array<{ collection: string; id: number | string; warnings: string[] }>,
  };

  for (const collection of collections) {
    const result = await payload.find({
      collection,
      depth: 2,
      limit: 500,
      overrideAccess: true,
      pagination: false,
    });

    for (const doc of result.docs) {
      const legacyDoc = doc as LegacyContentDocument;

      if (typeof legacyDoc.legacyContentMarkdown === "string" && legacyDoc.legacyContentMarkdown.trim().length > 0) {
        report.skipped.push({ collection, id: doc.id, reason: "already-markdown" });
        continue;
      }

      if (!isLexicalDocument(legacyDoc.content)) {
        report.skipped.push({ collection, id: doc.id, reason: "not-lexical" });
        continue;
      }

      try {
        const { markdown, warnings } = lexicalContentToMarkdownWithMeta(legacyDoc.content);

        if (!markdown.trim()) {
          report.failed.push({ collection, id: doc.id, reason: "empty-markdown" });
          continue;
        }

        await payload.update({
          collection,
          id: doc.id,
          data: {
            contentRich: markdownToRichContent(markdown),
            legacyContentMarkdown: markdown,
          },
          overrideAccess: true,
        });

        report.migrated.push({ collection, id: doc.id });

        if (warnings.length > 0) {
          report.warnings.push({ collection, id: doc.id, warnings });
        }
      } catch (error) {
        report.failed.push({
          collection,
          id: doc.id,
          reason: error instanceof Error ? error.message : "unknown-error",
        });
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.failed.length > 0) {
    process.exitCode = 1;
  }

  process.exit(process.exitCode ?? 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
