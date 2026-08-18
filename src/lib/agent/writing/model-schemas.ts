import { z } from "zod";

import type {
  WritingAssistAction,
  WritingAssistResult,
} from "../prompts/writing-assist";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

const textResultShape = {
  result: boundedText(20_000),
};

export const writingTextResultBaseSchema = z.object(textResultShape);
export const writingTextResultSchema = z.object(textResultShape).strict();

const tagsResultShape = {
  tags: z.array(boundedText(48)).min(1).max(8),
};

export const writingTagsResultBaseSchema = z.object(tagsResultShape);
export const writingTagsResultSchema = z.object(tagsResultShape).strict();

const outlineItemShape = {
  id: boundedText(64),
  level: z.number().int().min(1).max(3),
  text: boundedText(240),
};

export const writingOutlineItemBaseSchema = z.object(outlineItemShape);
export const writingOutlineItemSchema = z.object(outlineItemShape).strict();

const outlineResultBaseShape = {
  outline: z.array(writingOutlineItemBaseSchema).min(1).max(24),
};
const outlineResultStrictShape = {
  outline: z.array(writingOutlineItemSchema).min(1).max(24),
};

export const writingOutlineResultBaseSchema = z.object(
  outlineResultBaseShape,
);
export const writingOutlineResultSchema = z.object(
  outlineResultStrictShape,
).strict();

export type WritingAssistSchemaContract = Readonly<{
  allowedFields: readonly string[];
  modelSchema: z.ZodType<WritingAssistResult>;
  schema: z.ZodType<WritingAssistResult>;
  schemaName: string;
}>;

export const getWritingAssistSchemaContract = (
  action: WritingAssistAction,
): WritingAssistSchemaContract => {
  if (action === "extract_tags") {
    return {
      allowedFields: Object.freeze(writingTagsResultSchema.keyof().options),
      modelSchema: writingTagsResultBaseSchema,
      schema: writingTagsResultSchema,
      schemaName: "WritingTagsResult",
    };
  }

  if (action === "generate_outline") {
    return {
      allowedFields: Object.freeze(writingOutlineResultSchema.keyof().options),
      modelSchema: writingOutlineResultBaseSchema,
      schema: writingOutlineResultSchema,
      schemaName: "WritingOutlineResult",
    };
  }

  return {
    allowedFields: Object.freeze(writingTextResultSchema.keyof().options),
    modelSchema: writingTextResultBaseSchema,
    schema: writingTextResultSchema,
    schemaName: "WritingTextResult",
  };
};

export const getWritingAssistModelSchemas = getWritingAssistSchemaContract;
