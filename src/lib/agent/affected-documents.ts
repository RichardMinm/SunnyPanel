export type AffectedDocumentSummary = {
  collection: string;
  documentId: number;
  operation: "create" | "delete" | "update";
  visibility: "private" | "public" | "unknown";
};

const affectedCollections = new Set([
  "agent-memories",
  "checklists",
  "plans",
  "schedule-items",
  "timeline-events",
]);
const affectedOperations = new Set<AffectedDocumentSummary["operation"]>([
  "create",
  "delete",
  "update",
]);
const affectedVisibilities = new Set<AffectedDocumentSummary["visibility"]>([
  "private",
  "public",
  "unknown",
]);

/** Public response boundary: keep only bounded UI summaries, never snapshots or tool extras. */
export const sanitizeAffectedDocuments = (
  value: unknown,
): AffectedDocumentSummary[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const documents = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;

    return (
      typeof record.collection === "string"
      && affectedCollections.has(record.collection)
      && typeof record.documentId === "number"
      && Number.isSafeInteger(record.documentId)
      && record.documentId > 0
      && typeof record.operation === "string"
      && affectedOperations.has(
        record.operation as AffectedDocumentSummary["operation"],
      )
      && typeof record.visibility === "string"
      && affectedVisibilities.has(
        record.visibility as AffectedDocumentSummary["visibility"],
      )
    )
      ? [{
          collection: record.collection,
          documentId: record.documentId,
          operation: record.operation as AffectedDocumentSummary["operation"],
          visibility: record.visibility as AffectedDocumentSummary["visibility"],
        }]
      : [];
  });

  return documents.length > 0 ? documents : undefined;
};
