import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_writing_categories_icon" AS ENUM(
        'post', 'note', 'sparkle', 'document', 'pencil', 'layers', 'archive'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_writing_categories_tint" AS ENUM(
        'accent', 'info', 'warning', 'success', 'muted'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "writing_categories" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "icon" "enum_writing_categories_icon" DEFAULT 'layers' NOT NULL,
      "tint" "enum_writing_categories_tint" DEFAULT 'accent' NOT NULL,
      "sort_order" numeric DEFAULT 0,
      "archived" boolean DEFAULT false,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "writing_category_id" integer;
    ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "writing_category_id" integer;
    ALTER TABLE "updates" ADD COLUMN IF NOT EXISTS "writing_category_id" integer;
    ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "writing_category_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "writing_categories_id" integer;

    DO $$ BEGIN
      ALTER TABLE "posts"
        ADD CONSTRAINT "posts_writing_category_id_writing_categories_id_fk"
        FOREIGN KEY ("writing_category_id")
        REFERENCES "public"."writing_categories"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "notes"
        ADD CONSTRAINT "notes_writing_category_id_writing_categories_id_fk"
        FOREIGN KEY ("writing_category_id")
        REFERENCES "public"."writing_categories"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "updates"
        ADD CONSTRAINT "updates_writing_category_id_writing_categories_id_fk"
        FOREIGN KEY ("writing_category_id")
        REFERENCES "public"."writing_categories"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "pages"
        ADD CONSTRAINT "pages_writing_category_id_writing_categories_id_fk"
        FOREIGN KEY ("writing_category_id")
        REFERENCES "public"."writing_categories"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_writing_categories_fk"
        FOREIGN KEY ("writing_categories_id")
        REFERENCES "public"."writing_categories"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "posts_writing_category_idx"
      ON "posts" USING btree ("writing_category_id");
    CREATE INDEX IF NOT EXISTS "notes_writing_category_idx"
      ON "notes" USING btree ("writing_category_id");
    CREATE INDEX IF NOT EXISTS "updates_writing_category_idx"
      ON "updates" USING btree ("writing_category_id");
    CREATE INDEX IF NOT EXISTS "pages_writing_category_idx"
      ON "pages" USING btree ("writing_category_id");
    CREATE INDEX IF NOT EXISTS "writing_categories_updated_at_idx"
      ON "writing_categories" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "writing_categories_created_at_idx"
      ON "writing_categories" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_writing_categories_id_idx"
      ON "payload_locked_documents_rels" USING btree ("writing_categories_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_writing_categories_fk";
    ALTER TABLE "pages"
      DROP CONSTRAINT IF EXISTS "pages_writing_category_id_writing_categories_id_fk";
    ALTER TABLE "updates"
      DROP CONSTRAINT IF EXISTS "updates_writing_category_id_writing_categories_id_fk";
    ALTER TABLE "notes"
      DROP CONSTRAINT IF EXISTS "notes_writing_category_id_writing_categories_id_fk";
    ALTER TABLE "posts"
      DROP CONSTRAINT IF EXISTS "posts_writing_category_id_writing_categories_id_fk";

    DROP INDEX IF EXISTS "payload_locked_documents_rels_writing_categories_id_idx";
    DROP INDEX IF EXISTS "writing_categories_created_at_idx";
    DROP INDEX IF EXISTS "writing_categories_updated_at_idx";
    DROP INDEX IF EXISTS "pages_writing_category_idx";
    DROP INDEX IF EXISTS "updates_writing_category_idx";
    DROP INDEX IF EXISTS "notes_writing_category_idx";
    DROP INDEX IF EXISTS "posts_writing_category_idx";

    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "writing_categories_id";
    ALTER TABLE "pages" DROP COLUMN IF EXISTS "writing_category_id";
    ALTER TABLE "updates" DROP COLUMN IF EXISTS "writing_category_id";
    ALTER TABLE "notes" DROP COLUMN IF EXISTS "writing_category_id";
    ALTER TABLE "posts" DROP COLUMN IF EXISTS "writing_category_id";

    DROP TABLE IF EXISTS "writing_categories" CASCADE;

    DROP TYPE IF EXISTS "public"."enum_writing_categories_tint";
    DROP TYPE IF EXISTS "public"."enum_writing_categories_icon";
  `);
}
