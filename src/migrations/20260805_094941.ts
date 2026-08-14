import { sql } from '@payloadcms/db-postgres'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum__posts_v_version_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum__notes_v_version_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum__notes_v_version_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum__updates_v_version_type" AS ENUM('life', 'work', 'project');
  CREATE TYPE "public"."enum__updates_v_version_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum__updates_v_version_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum__pages_v_version_visibility" AS ENUM('public', 'private');
  CREATE TABLE "_posts_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_title" varchar NOT NULL,
	"version_generate_slug" boolean DEFAULT false,
	"version_slug" varchar NOT NULL,
	"version_summary" varchar NOT NULL,
	"version_content_rich" jsonb NOT NULL,
	"version_content_text" varchar,
	"version_content_excerpt" varchar,
	"version_content_outline" jsonb,
	"version_content_version" varchar DEFAULT 'tiptap-v1',
	"version_legacy_content_markdown" varchar,
	"version_cover_image_id" integer,
	"version_status" "enum__posts_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_published_at" timestamp(3) with time zone,
	"version_visibility" "enum__posts_v_version_visibility" DEFAULT 'public' NOT NULL,
	"version_writing_category_id" integer,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_posts_v_texts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"text" varchar
  );

  CREATE TABLE "_notes_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_content_rich" jsonb NOT NULL,
	"version_content_text" varchar,
	"version_content_excerpt" varchar,
	"version_content_outline" jsonb,
	"version_content_version" varchar DEFAULT 'tiptap-v1',
	"version_legacy_content_markdown" varchar,
	"version_mood" varchar,
	"version_category" varchar DEFAULT 'note' NOT NULL,
	"version_pinned" boolean DEFAULT false,
	"version_cover_image_id" integer,
	"version_status" "enum__notes_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_visibility" "enum__notes_v_version_visibility" DEFAULT 'public' NOT NULL,
	"version_writing_category_id" integer,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_updates_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_type" "enum__updates_v_version_type" DEFAULT 'life' NOT NULL,
	"version_content_rich" jsonb NOT NULL,
	"version_content_text" varchar,
	"version_content_excerpt" varchar,
	"version_content_outline" jsonb,
	"version_content_version" varchar DEFAULT 'tiptap-v1',
	"version_legacy_content_markdown" varchar,
	"version_link" varchar,
	"version_cover_image_id" integer,
	"version_status" "enum__updates_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_visibility" "enum__updates_v_version_visibility" DEFAULT 'public' NOT NULL,
	"version_writing_category_id" integer,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_pages_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_title" varchar NOT NULL,
	"version_generate_slug" boolean DEFAULT false,
	"version_slug" varchar NOT NULL,
	"version_summary" varchar,
	"version_content_rich" jsonb NOT NULL,
	"version_content_text" varchar,
	"version_content_excerpt" varchar,
	"version_content_outline" jsonb,
	"version_content_version" varchar DEFAULT 'tiptap-v1',
	"version_legacy_content_markdown" varchar,
	"version_cover_image_id" integer,
	"version_status" "enum__pages_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_visibility" "enum__pages_v_version_visibility" DEFAULT 'public' NOT NULL,
	"version_writing_category_id" integer,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "writing_categories" ADD COLUMN "parent_id" integer;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_writing_category_id_writing_categories_id_fk" FOREIGN KEY ("version_writing_category_id") REFERENCES "public"."writing_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_texts" ADD CONSTRAINT "_posts_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_parent_id_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_writing_category_id_writing_categories_id_fk" FOREIGN KEY ("version_writing_category_id") REFERENCES "public"."writing_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_updates_v" ADD CONSTRAINT "_updates_v_parent_id_updates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."updates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_updates_v" ADD CONSTRAINT "_updates_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_updates_v" ADD CONSTRAINT "_updates_v_version_writing_category_id_writing_categories_id_fk" FOREIGN KEY ("version_writing_category_id") REFERENCES "public"."writing_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_writing_category_id_writing_categories_id_fk" FOREIGN KEY ("version_writing_category_id") REFERENCES "public"."writing_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_cover_image_idx" ON "_posts_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_posts_v_version_version_status_idx" ON "_posts_v" USING btree ("version_status");
  CREATE INDEX "_posts_v_version_version_visibility_idx" ON "_posts_v" USING btree ("version_visibility");
  CREATE INDEX "_posts_v_version_version_writing_category_idx" ON "_posts_v" USING btree ("version_writing_category_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_texts_order_parent" ON "_posts_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_notes_v_parent_idx" ON "_notes_v" USING btree ("parent_id");
  CREATE INDEX "_notes_v_version_version_cover_image_idx" ON "_notes_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_notes_v_version_version_status_idx" ON "_notes_v" USING btree ("version_status");
  CREATE INDEX "_notes_v_version_version_visibility_idx" ON "_notes_v" USING btree ("version_visibility");
  CREATE INDEX "_notes_v_version_version_writing_category_idx" ON "_notes_v" USING btree ("version_writing_category_id");
  CREATE INDEX "_notes_v_version_version_updated_at_idx" ON "_notes_v" USING btree ("version_updated_at");
  CREATE INDEX "_notes_v_version_version_created_at_idx" ON "_notes_v" USING btree ("version_created_at");
  CREATE INDEX "_notes_v_created_at_idx" ON "_notes_v" USING btree ("created_at");
  CREATE INDEX "_notes_v_updated_at_idx" ON "_notes_v" USING btree ("updated_at");
  CREATE INDEX "_updates_v_parent_idx" ON "_updates_v" USING btree ("parent_id");
  CREATE INDEX "_updates_v_version_version_cover_image_idx" ON "_updates_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_updates_v_version_version_status_idx" ON "_updates_v" USING btree ("version_status");
  CREATE INDEX "_updates_v_version_version_visibility_idx" ON "_updates_v" USING btree ("version_visibility");
  CREATE INDEX "_updates_v_version_version_writing_category_idx" ON "_updates_v" USING btree ("version_writing_category_id");
  CREATE INDEX "_updates_v_version_version_updated_at_idx" ON "_updates_v" USING btree ("version_updated_at");
  CREATE INDEX "_updates_v_version_version_created_at_idx" ON "_updates_v" USING btree ("version_created_at");
  CREATE INDEX "_updates_v_created_at_idx" ON "_updates_v" USING btree ("created_at");
  CREATE INDEX "_updates_v_updated_at_idx" ON "_updates_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_cover_image_idx" ON "_pages_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_pages_v_version_version_status_idx" ON "_pages_v" USING btree ("version_status");
  CREATE INDEX "_pages_v_version_version_visibility_idx" ON "_pages_v" USING btree ("version_visibility");
  CREATE INDEX "_pages_v_version_version_writing_category_idx" ON "_pages_v" USING btree ("version_writing_category_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  ALTER TABLE "writing_categories" ADD CONSTRAINT "writing_categories_parent_id_writing_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."writing_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "writing_categories_parent_idx" ON "writing_categories" USING btree ("parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_posts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_notes_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_updates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_texts" CASCADE;
  DROP TABLE "_notes_v" CASCADE;
  DROP TABLE "_updates_v" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  ALTER TABLE "writing_categories" DROP CONSTRAINT "writing_categories_parent_id_writing_categories_id_fk";

  DROP INDEX "writing_categories_parent_idx";
  ALTER TABLE "writing_categories" DROP COLUMN "parent_id";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum__posts_v_version_visibility";
  DROP TYPE "public"."enum__notes_v_version_status";
  DROP TYPE "public"."enum__notes_v_version_visibility";
  DROP TYPE "public"."enum__updates_v_version_type";
  DROP TYPE "public"."enum__updates_v_version_status";
  DROP TYPE "public"."enum__updates_v_version_visibility";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_version_visibility";`)
}
