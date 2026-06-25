import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_posts_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_notes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_notes_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_updates_type" AS ENUM('life', 'work', 'project');
  CREATE TYPE "public"."enum_updates_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_updates_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_checklists_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_checklists_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_timeline_events_type" AS ENUM('milestone', 'project', 'life', 'study', 'exam', 'agent');
  CREATE TYPE "public"."enum_timeline_events_source_type" AS ENUM('checklist', 'schedule', 'plan', 'manual', 'agent');
  CREATE TYPE "public"."enum_timeline_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_timeline_events_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_plans_execution_mode" AS ENUM('manual', 'hybrid', 'agent');
  CREATE TYPE "public"."enum_plans_domain" AS ENUM('study', 'work', 'travel', 'fitness', 'creative', 'other');
  CREATE TYPE "public"."enum_plans_agent_state" AS ENUM('idle', 'ready', 'running', 'blocked', 'review');
  CREATE TYPE "public"."enum_plans_state" AS ENUM('backlog', 'active', 'paused', 'done');
  CREATE TYPE "public"."enum_plans_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_plans_priority" AS ENUM('low', 'medium', 'high');
  CREATE TYPE "public"."enum_plans_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_schedule_items_status" AS ENUM('planned', 'done', 'skipped', 'canceled');
  CREATE TYPE "public"."enum_schedule_items_priority" AS ENUM('low', 'medium', 'high');
  CREATE TYPE "public"."enum_schedule_items_source_type" AS ENUM('plan', 'checklist', 'manual', 'agent');
  CREATE TYPE "public"."enum_schedule_items_category" AS ENUM('course', 'study', 'plan_action', 'agent', 'exam', 'default');
  CREATE TYPE "public"."enum_schedule_items_created_by" AS ENUM('manual', 'agent');
  CREATE TYPE "public"."enum_plan_reviews_scope" AS ENUM('overall', 'plan');
  CREATE TYPE "public"."enum_plan_reviews_health" AS ENUM('healthy', 'attention', 'risk');
  CREATE TYPE "public"."enum_plan_reviews_source" AS ENUM('agent', 'manual');
  CREATE TYPE "public"."enum_agent_threads_messages_role" AS ENUM('user', 'assistant');
  CREATE TYPE "public"."enum_agent_threads_status" AS ENUM('active', 'closed');
  CREATE TYPE "public"."enum_agent_threads_last_intent" AS ENUM('answer_question', 'create_plan', 'append_plan_item', 'complete_plan_item', 'compose_plan', 'compose_schedule_item', 'compose_timeline_event', 'add_completion_note', 'save_memory', 'query_progress', 'query_plan_progress', 'evaluate_plan', 'schedule_plan', 'weekly_review', 'reschedule_item', 'cancel_schedule_item', 'clarify', 'modify_record', 'delete_record', 'capability_query', 'query_checklist_progress', 'query_memory', 'query_plan', 'query_schedule', 'query_timeline');
  CREATE TYPE "public"."enum_agent_threads_last_engine" AS ENUM('glm', 'openai', 'zai', 'heuristic', 'workflow', 'model', 'openai-compatible');
  CREATE TYPE "public"."enum_agent_runs_steps_level" AS ENUM('info', 'warn', 'error');
  CREATE TYPE "public"."enum_agent_runs_workflow" AS ENUM('readiness-audit', 'planning', 'content-draft', 'publishing-review', 'sync', 'weekly-review', 'automation');
  CREATE TYPE "public"."enum_agent_runs_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');
  CREATE TYPE "public"."enum_agent_runs_trigger" AS ENUM('manual', 'scheduled', 'webhook', 'agent');
  CREATE TYPE "public"."enum_agent_runs_agent_role" AS ENUM('plan', 'schedule', 'review', 'memory', 'content', 'query', 'orchestrator');
  CREATE TYPE "public"."enum_agent_action_receipts_operation" AS ENUM('execute', 'rollback');
  CREATE TYPE "public"."enum_agent_action_receipts_status" AS ENUM('pending', 'succeeded', 'failed', 'indeterminate');
  CREATE TYPE "public"."enum_agent_thread_events_event_type" AS ENUM('legacy_bootstrap', 'user_received', 'assistant_completed', 'turn_failed', 'projection_failed');
  CREATE TYPE "public"."enum_agent_memories_type" AS ENUM('preference', 'project_context', 'writing_style', 'workflow_rule', 'fact');
  CREATE TYPE "public"."enum_agent_memories_status" AS ENUM('active', 'archived');
  CREATE TYPE "public"."enum_agent_memories_visibility" AS ENUM('private');
  CREATE TYPE "public"."enum_agent_suggestions_source" AS ENUM('dashboard', 'plan', 'content', 'content-lifecycle', 'timeline', 'agent-run', 'review');
  CREATE TYPE "public"."enum_agent_suggestions_risk_level" AS ENUM('low', 'medium', 'high');
  CREATE TYPE "public"."enum_agent_suggestions_status" AS ENUM('pending', 'accepted', 'dismissed', 'done');
  CREATE TYPE "public"."enum_agent_suggestions_created_by" AS ENUM('agent', 'manual');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_pages_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_agent_settings_provider" AS ENUM('openai-compatible', 'openai', 'zai');
  CREATE TABLE "users_sessions" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"created_at" timestamp(3) with time zone,
	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"email" varchar NOT NULL,
	"reset_password_token" varchar,
	"reset_password_expiration" timestamp(3) with time zone,
	"salt" varchar,
	"hash" varchar,
	"login_attempts" numeric DEFAULT 0,
	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"alt" varchar NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"url" varchar,
	"thumbnail_u_r_l" varchar,
	"filename" varchar,
	"mime_type" varchar,
	"filesize" numeric,
	"width" numeric,
	"height" numeric,
	"focal_x" numeric,
	"focal_y" numeric,
	"sizes_card_url" varchar,
	"sizes_card_width" numeric,
	"sizes_card_height" numeric,
	"sizes_card_mime_type" varchar,
	"sizes_card_filesize" numeric,
	"sizes_card_filename" varchar,
	"sizes_thumbnail_url" varchar,
	"sizes_thumbnail_width" numeric,
	"sizes_thumbnail_height" numeric,
	"sizes_thumbnail_mime_type" varchar,
	"sizes_thumbnail_filesize" numeric,
	"sizes_thumbnail_filename" varchar
  );

  CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"generate_slug" boolean DEFAULT false,
	"slug" varchar NOT NULL,
	"summary" varchar NOT NULL,
	"content_rich" jsonb NOT NULL,
	"content_text" varchar,
	"content_excerpt" varchar,
	"content_outline" jsonb,
	"content_version" varchar DEFAULT 'tiptap-v1',
	"legacy_content_markdown" varchar,
	"cover_image_id" integer,
	"status" "enum_posts_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp(3) with time zone,
	"visibility" "enum_posts_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "posts_texts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"text" varchar
  );

  CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_rich" jsonb NOT NULL,
	"content_text" varchar,
	"content_excerpt" varchar,
	"content_outline" jsonb,
	"content_version" varchar DEFAULT 'tiptap-v1',
	"legacy_content_markdown" varchar,
	"mood" varchar,
	"category" varchar DEFAULT 'note' NOT NULL,
	"pinned" boolean DEFAULT false,
	"cover_image_id" integer,
	"status" "enum_notes_status" DEFAULT 'draft' NOT NULL,
	"visibility" "enum_notes_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "enum_updates_type" DEFAULT 'life' NOT NULL,
	"content_rich" jsonb NOT NULL,
	"content_text" varchar,
	"content_excerpt" varchar,
	"content_outline" jsonb,
	"content_version" varchar DEFAULT 'tiptap-v1',
	"legacy_content_markdown" varchar,
	"link" varchar,
	"cover_image_id" integer,
	"status" "enum_updates_status" DEFAULT 'draft' NOT NULL,
	"visibility" "enum_updates_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "checklists_groups_items" (
	"_order" integer NOT NULL,
	"_parent_id" varchar NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp(3) with time zone,
	"completion_note" varchar
  );

  CREATE TABLE "checklists_groups" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL
  );

  CREATE TABLE "checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"generate_slug" boolean DEFAULT false,
	"slug" varchar NOT NULL,
	"summary" varchar,
	"status" "enum_checklists_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp(3) with time zone,
	"visibility" "enum_checklists_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "timeline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar,
	"event_date" timestamp(3) with time zone NOT NULL,
	"type" "enum_timeline_events_type" DEFAULT 'milestone' NOT NULL,
	"source_type" "enum_timeline_events_source_type" DEFAULT 'manual',
	"related_post_id" integer,
	"related_update_id" integer,
	"related_checklist_id" integer,
	"related_task_key" varchar,
	"is_featured" boolean DEFAULT false,
	"sort_order" numeric DEFAULT 0,
	"status" "enum_timeline_events_status" DEFAULT 'draft' NOT NULL,
	"visibility" "enum_timeline_events_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar,
	"execution_mode" "enum_plans_execution_mode" DEFAULT 'manual' NOT NULL,
	"domain" "enum_plans_domain" DEFAULT 'other' NOT NULL,
	"agent_state" "enum_plans_agent_state" DEFAULT 'idle' NOT NULL,
	"agent_brief" varchar,
	"last_agent_run_id" integer,
	"state" "enum_plans_state" DEFAULT 'backlog' NOT NULL,
	"status" "enum_plans_status" DEFAULT 'draft' NOT NULL,
	"priority" "enum_plans_priority" DEFAULT 'medium' NOT NULL,
	"start_date" timestamp(3) with time zone,
	"due_date" timestamp(3) with time zone,
	"visibility" "enum_plans_visibility" DEFAULT 'private' NOT NULL,
	"phases" jsonb,
	"weekly_rhythm" varchar,
	"total_estimated_days" numeric,
	"progress" numeric DEFAULT 0,
	"prerequisites" jsonb,
	"agent_context" jsonb,
	"subtasks" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "plans_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"posts_id" integer,
	"notes_id" integer,
	"updates_id" integer,
	"checklists_id" integer,
	"timeline_events_id" integer,
	"pages_id" integer
  );

  CREATE TABLE "schedule_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"description" varchar,
	"date" timestamp(3) with time zone NOT NULL,
	"start_time" varchar,
	"end_time" varchar,
	"is_all_day" boolean DEFAULT false,
	"status" "enum_schedule_items_status" DEFAULT 'planned' NOT NULL,
	"priority" "enum_schedule_items_priority" DEFAULT 'medium' NOT NULL,
	"source_type" "enum_schedule_items_source_type" DEFAULT 'manual' NOT NULL,
	"category" "enum_schedule_items_category" DEFAULT 'default',
	"related_plan_id" integer,
	"related_checklist_id" integer,
	"related_checklist_item_key" varchar,
	"agent_brief" varchar,
	"created_by" "enum_schedule_items_created_by" DEFAULT 'manual' NOT NULL,
	"conflict_note" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "plan_reviews_recommendations" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"content" varchar NOT NULL
  );

  CREATE TABLE "plan_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"scope" "enum_plan_reviews_scope" DEFAULT 'overall' NOT NULL,
	"health" "enum_plan_reviews_health" DEFAULT 'attention' NOT NULL,
	"plan_id" integer,
	"summary" varchar NOT NULL,
	"metrics" jsonb,
	"source" "enum_plan_reviews_source" DEFAULT 'agent' NOT NULL,
	"reviewed_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_threads_messages" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"role" "enum_agent_threads_messages_role" NOT NULL,
	"content" varchar NOT NULL,
	"recorded_at" timestamp(3) with time zone
  );

  CREATE TABLE "agent_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar DEFAULT 'Agent Thread' NOT NULL,
	"status" "enum_agent_threads_status" DEFAULT 'active' NOT NULL,
	"user_id" integer NOT NULL,
	"pending_action" jsonb,
	"summary" varchar,
	"summary_updated_at" timestamp(3) with time zone,
	"summary_message_count" numeric,
	"last_intent" "enum_agent_threads_last_intent",
	"last_engine" "enum_agent_threads_last_engine",
	"last_confidence" numeric,
	"last_interaction_at" timestamp(3) with time zone,
	"tags" jsonb,
	"archived" boolean DEFAULT false,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_runs_steps" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"recorded_at" timestamp(3) with time zone,
	"level" "enum_agent_runs_steps_level" DEFAULT 'info' NOT NULL,
	"message" varchar NOT NULL
  );

  CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"workflow" "enum_agent_runs_workflow" DEFAULT 'readiness-audit' NOT NULL,
	"status" "enum_agent_runs_status" DEFAULT 'queued' NOT NULL,
	"trigger" "enum_agent_runs_trigger" DEFAULT 'manual' NOT NULL,
	"user_id" integer,
	"goal" varchar,
	"summary" varchar,
	"next_action" varchar,
	"related_plan_id" integer,
	"started_at" timestamp(3) with time zone,
	"completed_at" timestamp(3) with time zone,
	"duration_ms" numeric,
	"affected_documents" jsonb,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"rollback_payload" jsonb,
	"rollback_available" boolean DEFAULT false,
	"orchestration_id" varchar,
	"agent_role" "enum_agent_runs_agent_role",
	"model" varchar,
	"provider" varchar,
	"token_usage" jsonb,
	"trace" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_runs_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"posts_id" integer,
	"notes_id" integer,
	"updates_id" integer,
	"checklists_id" integer,
	"timeline_events_id" integer,
	"plan_reviews_id" integer,
	"agent_memories_id" integer,
	"pages_id" integer
  );

  CREATE TABLE "agent_action_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar NOT NULL,
	"action_id" varchar NOT NULL,
	"intent" varchar NOT NULL,
	"operation" "enum_agent_action_receipts_operation" DEFAULT 'execute' NOT NULL,
	"status" "enum_agent_action_receipts_status" DEFAULT 'pending' NOT NULL,
	"user_id" integer NOT NULL,
	"thread_id" integer NOT NULL,
	"response" jsonb,
	"rollback_payload" jsonb,
	"error" varchar,
	"completed_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_thread_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" varchar NOT NULL,
	"turn_id" varchar NOT NULL,
	"event_type" "enum_agent_thread_events_event_type" NOT NULL,
	"schema_version" numeric DEFAULT 1 NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"type" "enum_agent_memories_type" DEFAULT 'fact' NOT NULL,
	"content" varchar NOT NULL,
	"embedding" jsonb,
	"confidence" numeric DEFAULT 0.7 NOT NULL,
	"source_thread_id" integer,
	"source_run_id" integer,
	"last_used_at" timestamp(3) with time zone,
	"status" "enum_agent_memories_status" DEFAULT 'active' NOT NULL,
	"visibility" "enum_agent_memories_visibility" DEFAULT 'private' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"reason" varchar NOT NULL,
	"suggested_prompt" varchar NOT NULL,
	"unique_key" varchar NOT NULL,
	"source" "enum_agent_suggestions_source" DEFAULT 'dashboard' NOT NULL,
	"risk_level" "enum_agent_suggestions_risk_level" DEFAULT 'low' NOT NULL,
	"status" "enum_agent_suggestions_status" DEFAULT 'pending' NOT NULL,
	"related_plan_id" integer,
	"created_by" "enum_agent_suggestions_created_by" DEFAULT 'agent' NOT NULL,
	"dismissed_at" timestamp(3) with time zone,
	"accepted_at" timestamp(3) with time zone,
	"completed_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_suggestions_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"posts_id" integer,
	"notes_id" integer,
	"updates_id" integer,
	"checklists_id" integer,
	"timeline_events_id" integer,
	"pages_id" integer
  );

  CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"generate_slug" boolean DEFAULT false,
	"slug" varchar NOT NULL,
	"content_rich" jsonb NOT NULL,
	"content_text" varchar,
	"content_excerpt" varchar,
	"content_outline" jsonb,
	"content_version" varchar DEFAULT 'tiptap-v1',
	"legacy_content_markdown" varchar,
	"cover_image_id" integer,
	"status" "enum_pages_status" DEFAULT 'draft' NOT NULL,
	"visibility" "enum_pages_visibility" DEFAULT 'public' NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar NOT NULL,
	"data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"global_slug" varchar,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"users_id" integer,
	"media_id" integer,
	"posts_id" integer,
	"notes_id" integer,
	"updates_id" integer,
	"checklists_id" integer,
	"timeline_events_id" integer,
	"plans_id" integer,
	"schedule_items_id" integer,
	"plan_reviews_id" integer,
	"agent_threads_id" integer,
	"agent_runs_id" integer,
	"agent_action_receipts_id" integer,
	"agent_thread_events_id" integer,
	"agent_memories_id" integer,
	"agent_suggestions_id" integer,
	"pages_id" integer
  );

  CREATE TABLE "payload_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar,
	"value" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
	"id" serial PRIMARY KEY NOT NULL,
	"order" integer,
	"parent_id" integer NOT NULL,
	"path" varchar NOT NULL,
	"users_id" integer
  );

  CREATE TABLE "payload_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar,
	"batch" numeric,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "agent_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true,
	"provider" "enum_agent_settings_provider" DEFAULT 'openai-compatible' NOT NULL,
	"base_url" varchar,
	"model" varchar,
	"api_key" varchar,
	"notes" varchar,
	"updated_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_texts" ADD CONSTRAINT "posts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notes" ADD CONSTRAINT "notes_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "updates" ADD CONSTRAINT "updates_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checklists_groups_items" ADD CONSTRAINT "checklists_groups_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."checklists_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "checklists_groups" ADD CONSTRAINT "checklists_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_related_post_id_posts_id_fk" FOREIGN KEY ("related_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_related_update_id_updates_id_fk" FOREIGN KEY ("related_update_id") REFERENCES "public"."updates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_related_checklist_id_checklists_id_fk" FOREIGN KEY ("related_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "plans" ADD CONSTRAINT "plans_last_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("last_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_updates_fk" FOREIGN KEY ("updates_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_checklists_fk" FOREIGN KEY ("checklists_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_timeline_events_fk" FOREIGN KEY ("timeline_events_id") REFERENCES "public"."timeline_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_related_plan_id_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_related_checklist_id_checklists_id_fk" FOREIGN KEY ("related_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "plan_reviews_recommendations" ADD CONSTRAINT "plan_reviews_recommendations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."plan_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_threads_messages" ADD CONSTRAINT "agent_threads_messages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_runs_steps" ADD CONSTRAINT "agent_runs_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_related_plan_id_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_updates_fk" FOREIGN KEY ("updates_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_checklists_fk" FOREIGN KEY ("checklists_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_timeline_events_fk" FOREIGN KEY ("timeline_events_id") REFERENCES "public"."timeline_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_plan_reviews_fk" FOREIGN KEY ("plan_reviews_id") REFERENCES "public"."plan_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_agent_memories_fk" FOREIGN KEY ("agent_memories_id") REFERENCES "public"."agent_memories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_runs_rels" ADD CONSTRAINT "agent_runs_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_action_receipts" ADD CONSTRAINT "agent_action_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_action_receipts" ADD CONSTRAINT "agent_action_receipts_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_thread_events" ADD CONSTRAINT "agent_thread_events_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_thread_events" ADD CONSTRAINT "agent_thread_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_source_thread_id_agent_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_source_run_id_agent_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_suggestions" ADD CONSTRAINT "agent_suggestions_related_plan_id_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agent_suggestions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_updates_fk" FOREIGN KEY ("updates_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_checklists_fk" FOREIGN KEY ("checklists_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_timeline_events_fk" FOREIGN KEY ("timeline_events_id") REFERENCES "public"."timeline_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "agent_suggestions_rels" ADD CONSTRAINT "agent_suggestions_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_updates_fk" FOREIGN KEY ("updates_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_checklists_fk" FOREIGN KEY ("checklists_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_timeline_events_fk" FOREIGN KEY ("timeline_events_id") REFERENCES "public"."timeline_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_plans_fk" FOREIGN KEY ("plans_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schedule_items_fk" FOREIGN KEY ("schedule_items_id") REFERENCES "public"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_plan_reviews_fk" FOREIGN KEY ("plan_reviews_id") REFERENCES "public"."plan_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_threads_fk" FOREIGN KEY ("agent_threads_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_runs_fk" FOREIGN KEY ("agent_runs_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_action_receipts_fk" FOREIGN KEY ("agent_action_receipts_id") REFERENCES "public"."agent_action_receipts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_thread_events_fk" FOREIGN KEY ("agent_thread_events_id") REFERENCES "public"."agent_thread_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_memories_fk" FOREIGN KEY ("agent_memories_id") REFERENCES "public"."agent_memories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_suggestions_fk" FOREIGN KEY ("agent_suggestions_id") REFERENCES "public"."agent_suggestions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_cover_image_idx" ON "posts" USING btree ("cover_image_id");
  CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");
  CREATE INDEX "posts_visibility_idx" ON "posts" USING btree ("visibility");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts_texts_order_parent" ON "posts_texts" USING btree ("order","parent_id");
  CREATE INDEX "notes_cover_image_idx" ON "notes" USING btree ("cover_image_id");
  CREATE INDEX "notes_status_idx" ON "notes" USING btree ("status");
  CREATE INDEX "notes_visibility_idx" ON "notes" USING btree ("visibility");
  CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");
  CREATE INDEX "notes_created_at_idx" ON "notes" USING btree ("created_at");
  CREATE INDEX "updates_cover_image_idx" ON "updates" USING btree ("cover_image_id");
  CREATE INDEX "updates_status_idx" ON "updates" USING btree ("status");
  CREATE INDEX "updates_visibility_idx" ON "updates" USING btree ("visibility");
  CREATE INDEX "updates_updated_at_idx" ON "updates" USING btree ("updated_at");
  CREATE INDEX "updates_created_at_idx" ON "updates" USING btree ("created_at");
  CREATE INDEX "checklists_groups_items_order_idx" ON "checklists_groups_items" USING btree ("_order");
  CREATE INDEX "checklists_groups_items_parent_id_idx" ON "checklists_groups_items" USING btree ("_parent_id");
  CREATE INDEX "checklists_groups_order_idx" ON "checklists_groups" USING btree ("_order");
  CREATE INDEX "checklists_groups_parent_id_idx" ON "checklists_groups" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "checklists_slug_idx" ON "checklists" USING btree ("slug");
  CREATE INDEX "checklists_status_idx" ON "checklists" USING btree ("status");
  CREATE INDEX "checklists_visibility_idx" ON "checklists" USING btree ("visibility");
  CREATE INDEX "checklists_updated_at_idx" ON "checklists" USING btree ("updated_at");
  CREATE INDEX "checklists_created_at_idx" ON "checklists" USING btree ("created_at");
  CREATE INDEX "timeline_events_related_post_idx" ON "timeline_events" USING btree ("related_post_id");
  CREATE INDEX "timeline_events_related_update_idx" ON "timeline_events" USING btree ("related_update_id");
  CREATE INDEX "timeline_events_related_checklist_idx" ON "timeline_events" USING btree ("related_checklist_id");
  CREATE INDEX "timeline_events_status_idx" ON "timeline_events" USING btree ("status");
  CREATE INDEX "timeline_events_visibility_idx" ON "timeline_events" USING btree ("visibility");
  CREATE INDEX "timeline_events_updated_at_idx" ON "timeline_events" USING btree ("updated_at");
  CREATE INDEX "timeline_events_created_at_idx" ON "timeline_events" USING btree ("created_at");
  CREATE INDEX "plans_last_agent_run_idx" ON "plans" USING btree ("last_agent_run_id");
  CREATE INDEX "plans_status_idx" ON "plans" USING btree ("status");
  CREATE INDEX "plans_visibility_idx" ON "plans" USING btree ("visibility");
  CREATE INDEX "plans_updated_at_idx" ON "plans" USING btree ("updated_at");
  CREATE INDEX "plans_created_at_idx" ON "plans" USING btree ("created_at");
  CREATE INDEX "plans_rels_order_idx" ON "plans_rels" USING btree ("order");
  CREATE INDEX "plans_rels_parent_idx" ON "plans_rels" USING btree ("parent_id");
  CREATE INDEX "plans_rels_path_idx" ON "plans_rels" USING btree ("path");
  CREATE INDEX "plans_rels_posts_id_idx" ON "plans_rels" USING btree ("posts_id");
  CREATE INDEX "plans_rels_notes_id_idx" ON "plans_rels" USING btree ("notes_id");
  CREATE INDEX "plans_rels_updates_id_idx" ON "plans_rels" USING btree ("updates_id");
  CREATE INDEX "plans_rels_checklists_id_idx" ON "plans_rels" USING btree ("checklists_id");
  CREATE INDEX "plans_rels_timeline_events_id_idx" ON "plans_rels" USING btree ("timeline_events_id");
  CREATE INDEX "plans_rels_pages_id_idx" ON "plans_rels" USING btree ("pages_id");
  CREATE INDEX "schedule_items_related_plan_idx" ON "schedule_items" USING btree ("related_plan_id");
  CREATE INDEX "schedule_items_related_checklist_idx" ON "schedule_items" USING btree ("related_checklist_id");
  CREATE INDEX "schedule_items_updated_at_idx" ON "schedule_items" USING btree ("updated_at");
  CREATE INDEX "schedule_items_created_at_idx" ON "schedule_items" USING btree ("created_at");
  CREATE INDEX "plan_reviews_recommendations_order_idx" ON "plan_reviews_recommendations" USING btree ("_order");
  CREATE INDEX "plan_reviews_recommendations_parent_id_idx" ON "plan_reviews_recommendations" USING btree ("_parent_id");
  CREATE INDEX "plan_reviews_plan_idx" ON "plan_reviews" USING btree ("plan_id");
  CREATE INDEX "plan_reviews_updated_at_idx" ON "plan_reviews" USING btree ("updated_at");
  CREATE INDEX "plan_reviews_created_at_idx" ON "plan_reviews" USING btree ("created_at");
  CREATE INDEX "agent_threads_messages_order_idx" ON "agent_threads_messages" USING btree ("_order");
  CREATE INDEX "agent_threads_messages_parent_id_idx" ON "agent_threads_messages" USING btree ("_parent_id");
  CREATE INDEX "agent_threads_user_idx" ON "agent_threads" USING btree ("user_id");
  CREATE INDEX "agent_threads_updated_at_idx" ON "agent_threads" USING btree ("updated_at");
  CREATE INDEX "agent_threads_created_at_idx" ON "agent_threads" USING btree ("created_at");
  CREATE INDEX "agent_runs_steps_order_idx" ON "agent_runs_steps" USING btree ("_order");
  CREATE INDEX "agent_runs_steps_parent_id_idx" ON "agent_runs_steps" USING btree ("_parent_id");
  CREATE INDEX "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id");
  CREATE INDEX "agent_runs_related_plan_idx" ON "agent_runs" USING btree ("related_plan_id");
  CREATE INDEX "agent_runs_updated_at_idx" ON "agent_runs" USING btree ("updated_at");
  CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");
  CREATE INDEX "agent_runs_rels_order_idx" ON "agent_runs_rels" USING btree ("order");
  CREATE INDEX "agent_runs_rels_parent_idx" ON "agent_runs_rels" USING btree ("parent_id");
  CREATE INDEX "agent_runs_rels_path_idx" ON "agent_runs_rels" USING btree ("path");
  CREATE INDEX "agent_runs_rels_posts_id_idx" ON "agent_runs_rels" USING btree ("posts_id");
  CREATE INDEX "agent_runs_rels_notes_id_idx" ON "agent_runs_rels" USING btree ("notes_id");
  CREATE INDEX "agent_runs_rels_updates_id_idx" ON "agent_runs_rels" USING btree ("updates_id");
  CREATE INDEX "agent_runs_rels_checklists_id_idx" ON "agent_runs_rels" USING btree ("checklists_id");
  CREATE INDEX "agent_runs_rels_timeline_events_id_idx" ON "agent_runs_rels" USING btree ("timeline_events_id");
  CREATE INDEX "agent_runs_rels_plan_reviews_id_idx" ON "agent_runs_rels" USING btree ("plan_reviews_id");
  CREATE INDEX "agent_runs_rels_agent_memories_id_idx" ON "agent_runs_rels" USING btree ("agent_memories_id");
  CREATE INDEX "agent_runs_rels_pages_id_idx" ON "agent_runs_rels" USING btree ("pages_id");
  CREATE UNIQUE INDEX "agent_action_receipts_key_idx" ON "agent_action_receipts" USING btree ("key");
  CREATE INDEX "agent_action_receipts_action_id_idx" ON "agent_action_receipts" USING btree ("action_id");
  CREATE INDEX "agent_action_receipts_user_idx" ON "agent_action_receipts" USING btree ("user_id");
  CREATE INDEX "agent_action_receipts_thread_idx" ON "agent_action_receipts" USING btree ("thread_id");
  CREATE INDEX "agent_action_receipts_updated_at_idx" ON "agent_action_receipts" USING btree ("updated_at");
  CREATE INDEX "agent_action_receipts_created_at_idx" ON "agent_action_receipts" USING btree ("created_at");
  CREATE UNIQUE INDEX "agent_thread_events_event_key_idx" ON "agent_thread_events" USING btree ("event_key");
  CREATE INDEX "agent_thread_events_turn_id_idx" ON "agent_thread_events" USING btree ("turn_id");
  CREATE INDEX "agent_thread_events_event_type_idx" ON "agent_thread_events" USING btree ("event_type");
  CREATE INDEX "agent_thread_events_thread_idx" ON "agent_thread_events" USING btree ("thread_id");
  CREATE INDEX "agent_thread_events_user_idx" ON "agent_thread_events" USING btree ("user_id");
  CREATE INDEX "agent_thread_events_recorded_at_idx" ON "agent_thread_events" USING btree ("recorded_at");
  CREATE INDEX "agent_thread_events_updated_at_idx" ON "agent_thread_events" USING btree ("updated_at");
  CREATE INDEX "agent_thread_events_created_at_idx" ON "agent_thread_events" USING btree ("created_at");
  CREATE INDEX "agent_memories_source_thread_idx" ON "agent_memories" USING btree ("source_thread_id");
  CREATE INDEX "agent_memories_source_run_idx" ON "agent_memories" USING btree ("source_run_id");
  CREATE INDEX "agent_memories_updated_at_idx" ON "agent_memories" USING btree ("updated_at");
  CREATE INDEX "agent_memories_created_at_idx" ON "agent_memories" USING btree ("created_at");
  CREATE UNIQUE INDEX "agent_suggestions_unique_key_idx" ON "agent_suggestions" USING btree ("unique_key");
  CREATE INDEX "agent_suggestions_related_plan_idx" ON "agent_suggestions" USING btree ("related_plan_id");
  CREATE INDEX "agent_suggestions_updated_at_idx" ON "agent_suggestions" USING btree ("updated_at");
  CREATE INDEX "agent_suggestions_created_at_idx" ON "agent_suggestions" USING btree ("created_at");
  CREATE INDEX "agent_suggestions_rels_order_idx" ON "agent_suggestions_rels" USING btree ("order");
  CREATE INDEX "agent_suggestions_rels_parent_idx" ON "agent_suggestions_rels" USING btree ("parent_id");
  CREATE INDEX "agent_suggestions_rels_path_idx" ON "agent_suggestions_rels" USING btree ("path");
  CREATE INDEX "agent_suggestions_rels_posts_id_idx" ON "agent_suggestions_rels" USING btree ("posts_id");
  CREATE INDEX "agent_suggestions_rels_notes_id_idx" ON "agent_suggestions_rels" USING btree ("notes_id");
  CREATE INDEX "agent_suggestions_rels_updates_id_idx" ON "agent_suggestions_rels" USING btree ("updates_id");
  CREATE INDEX "agent_suggestions_rels_checklists_id_idx" ON "agent_suggestions_rels" USING btree ("checklists_id");
  CREATE INDEX "agent_suggestions_rels_timeline_events_id_idx" ON "agent_suggestions_rels" USING btree ("timeline_events_id");
  CREATE INDEX "agent_suggestions_rels_pages_id_idx" ON "agent_suggestions_rels" USING btree ("pages_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_cover_image_idx" ON "pages" USING btree ("cover_image_id");
  CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");
  CREATE INDEX "pages_visibility_idx" ON "pages" USING btree ("visibility");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("notes_id");
  CREATE INDEX "payload_locked_documents_rels_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("updates_id");
  CREATE INDEX "payload_locked_documents_rels_checklists_id_idx" ON "payload_locked_documents_rels" USING btree ("checklists_id");
  CREATE INDEX "payload_locked_documents_rels_timeline_events_id_idx" ON "payload_locked_documents_rels" USING btree ("timeline_events_id");
  CREATE INDEX "payload_locked_documents_rels_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("plans_id");
  CREATE INDEX "payload_locked_documents_rels_schedule_items_id_idx" ON "payload_locked_documents_rels" USING btree ("schedule_items_id");
  CREATE INDEX "payload_locked_documents_rels_plan_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("plan_reviews_id");
  CREATE INDEX "payload_locked_documents_rels_agent_threads_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_threads_id");
  CREATE INDEX "payload_locked_documents_rels_agent_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_runs_id");
  CREATE INDEX "payload_locked_documents_rels_agent_action_receipts_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_action_receipts_id");
  CREATE INDEX "payload_locked_documents_rels_agent_thread_events_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_thread_events_id");
  CREATE INDEX "payload_locked_documents_rels_agent_memories_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_memories_id");
  CREATE INDEX "payload_locked_documents_rels_agent_suggestions_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_suggestions_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_texts" CASCADE;
  DROP TABLE "notes" CASCADE;
  DROP TABLE "updates" CASCADE;
  DROP TABLE "checklists_groups_items" CASCADE;
  DROP TABLE "checklists_groups" CASCADE;
  DROP TABLE "checklists" CASCADE;
  DROP TABLE "timeline_events" CASCADE;
  DROP TABLE "plans" CASCADE;
  DROP TABLE "plans_rels" CASCADE;
  DROP TABLE "schedule_items" CASCADE;
  DROP TABLE "plan_reviews_recommendations" CASCADE;
  DROP TABLE "plan_reviews" CASCADE;
  DROP TABLE "agent_threads_messages" CASCADE;
  DROP TABLE "agent_threads" CASCADE;
  DROP TABLE "agent_runs_steps" CASCADE;
  DROP TABLE "agent_runs" CASCADE;
  DROP TABLE "agent_runs_rels" CASCADE;
  DROP TABLE "agent_action_receipts" CASCADE;
  DROP TABLE "agent_thread_events" CASCADE;
  DROP TABLE "agent_memories" CASCADE;
  DROP TABLE "agent_suggestions" CASCADE;
  DROP TABLE "agent_suggestions_rels" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "agent_settings" CASCADE;
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum_posts_visibility";
  DROP TYPE "public"."enum_notes_status";
  DROP TYPE "public"."enum_notes_visibility";
  DROP TYPE "public"."enum_updates_type";
  DROP TYPE "public"."enum_updates_status";
  DROP TYPE "public"."enum_updates_visibility";
  DROP TYPE "public"."enum_checklists_status";
  DROP TYPE "public"."enum_checklists_visibility";
  DROP TYPE "public"."enum_timeline_events_type";
  DROP TYPE "public"."enum_timeline_events_source_type";
  DROP TYPE "public"."enum_timeline_events_status";
  DROP TYPE "public"."enum_timeline_events_visibility";
  DROP TYPE "public"."enum_plans_execution_mode";
  DROP TYPE "public"."enum_plans_domain";
  DROP TYPE "public"."enum_plans_agent_state";
  DROP TYPE "public"."enum_plans_state";
  DROP TYPE "public"."enum_plans_status";
  DROP TYPE "public"."enum_plans_priority";
  DROP TYPE "public"."enum_plans_visibility";
  DROP TYPE "public"."enum_schedule_items_status";
  DROP TYPE "public"."enum_schedule_items_priority";
  DROP TYPE "public"."enum_schedule_items_source_type";
  DROP TYPE "public"."enum_schedule_items_category";
  DROP TYPE "public"."enum_schedule_items_created_by";
  DROP TYPE "public"."enum_plan_reviews_scope";
  DROP TYPE "public"."enum_plan_reviews_health";
  DROP TYPE "public"."enum_plan_reviews_source";
  DROP TYPE "public"."enum_agent_threads_messages_role";
  DROP TYPE "public"."enum_agent_threads_status";
  DROP TYPE "public"."enum_agent_threads_last_intent";
  DROP TYPE "public"."enum_agent_threads_last_engine";
  DROP TYPE "public"."enum_agent_runs_steps_level";
  DROP TYPE "public"."enum_agent_runs_workflow";
  DROP TYPE "public"."enum_agent_runs_status";
  DROP TYPE "public"."enum_agent_runs_trigger";
  DROP TYPE "public"."enum_agent_runs_agent_role";
  DROP TYPE "public"."enum_agent_action_receipts_operation";
  DROP TYPE "public"."enum_agent_action_receipts_status";
  DROP TYPE "public"."enum_agent_thread_events_event_type";
  DROP TYPE "public"."enum_agent_memories_type";
  DROP TYPE "public"."enum_agent_memories_status";
  DROP TYPE "public"."enum_agent_memories_visibility";
  DROP TYPE "public"."enum_agent_suggestions_source";
  DROP TYPE "public"."enum_agent_suggestions_risk_level";
  DROP TYPE "public"."enum_agent_suggestions_status";
  DROP TYPE "public"."enum_agent_suggestions_created_by";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum_pages_visibility";
  DROP TYPE "public"."enum_agent_settings_provider";`)
}
